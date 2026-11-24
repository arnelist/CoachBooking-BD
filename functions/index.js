const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const Stripe = require("stripe");
const crypto = require("crypto");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");

const TRAINER_REMOVED_REASON = "The trainer is no longer available.";

//Delete many documents, BulkWriter splits them into batches itself
async function deleteDocs(docs) {
    const writer = db.bulkWriter();
    docs.forEach((d) => writer.delete(d.ref));
    await writer.close();
}

initializeApp();
const db = getFirestore();

setGlobalOptions({ region: "europe-central2", maxInstances: 10 });

//Secret keys exist only in the functions environment
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const CHECKIN_SECRET = defineSecret("CHECKIN_SECRET");

const HOLD_MINUTES = 10;
const KEEP_EXPIRED_DAYS = 7;
const CURRENCY = "eur";
const CANCEL_HOURS = 24;

function stripe() {
    return new Stripe(STRIPE_SECRET_KEY.value());
}

//Today's date
function todayInVilnius() {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vilnius" }).format(new Date());
}

//QR-code signature: valid only for this reservation on training day
function checkInSignature(reservationId, date) {
    return crypto
        .createHmac("sha256", CHECKIN_SECRET.value())
        .update(`${reservationId}:${date}`)
        .digest("base64url");
}

//Free unpaid reservation, free timeslot
async function releaseHold(reservationId, reason) {
    const reservationRef = db.doc(`reservations/${reservationId}`);

    const released = await db.runTransaction(async (tx) => {
        const reservation = (await tx.get(reservationRef)).data();
        if (!reservation || reservation.status !== "pending") return false; //paid or undone

        const slotRef = db.doc(`timeslots/${reservation.timeslotId}`);
        const slot = (await tx.get(slotRef)).data();

        tx.update(reservationRef, {
            status: "expired",
            expiredReason: reason,
            updatedAt: FieldValue.serverTimestamp(),
            deleteAt: Timestamp.fromMillis(Date.now() + KEEP_EXPIRED_DAYS * 24 * 3600 * 1000),
        });

        if (slot && slot.status === "held" && slot.reservationId === reservationId) {
            tx.update(slotRef, { status: "free", reservationId: null, holdExpiresAt: null });
        }
        return true;
    });
    if (!released) return;

    //Cancel unpaid PaymentIntents, so an annulled reservation can't be paid
    const payments = await db
        .collection("payments")
        .where("reservationId", "==", reservationId)
        .where("status", "==", "pending")
        .get();
    for (const p of payments.docs) {
        try {
            await stripe().paymentIntents.cancel(p.id);
            await p.ref.update({ status: "failed" });
        } catch (e) {
            //Already paid or processing - the webhook will refund it
            console.warn("Could not cancel PaymentIntent", p.id, e.message);
        }
    }
}

//Payment success: confirm reservation, or refund if annulled meanwhile
async function confirmReservation(intent, reservationId) {
    const reservationRef = db.doc(`reservations/${reservationId}`);
    const paymentRef = db.doc(`payments/${intent.id}`);

    const confirmed = await db.runTransaction(async (tx) => {
        const reservation = (await tx.get(reservationRef)).data();
        if (!reservation) return false;
        if (reservation.status === "confirmed") return true;
        if (reservation.status !== "pending") return false;

        const slotRef = db.doc(`timeslots/${reservation.timeslotId}`);
        const slot = (await tx.get(slotRef)).data();
        if (!slot || slot.reservationId !== reservationId) return false;

        tx.update(reservationRef, {
            status: "confirmed",
            paymentStatus: "paid",
            updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(slotRef, { 
            status: "booked",
            holdExpiresAt: null,
        });
        tx.update(paymentRef, { status: "succeeded" });
        return true;
    });

    if (!confirmed) {
        await stripe().refunds.create({ payment_intent: intent.id }, { idempotencyKey: `refund-${intent.id}` });
        await paymentRef.update({ status: "refunded" });
        await reservationRef.update({ 
            paymentStatus: "refunded", 
            updatedAt: FieldValue.serverTimestamp() 
        }).catch(() => {});
    }
}

//Refund every successful payment
async function refundReservation(reservationId) {
    const payments = await db
        .collection("payments")
        .where("reservationId", "==", reservationId)
        .where("status", "==", "succeeded")
        .get();
    
    for (const p of payments.docs) {
        try {
            await stripe().refunds.create(
                { payment_intent: p.id },
                { idempotencyKey: `refund-${p.id}` }
            );
        } catch (e) {
            //Already refunded
            if (e.code !== "charge_already_refunded") throw e;
        }
        await p.ref.update({ status: "refunded" });
    }

    await db.doc(`reservations/${reservationId}`).update({
        paymentStatus: "refunded",
        updatedAt: FieldValue.serverTimestamp(),
    });
}

//Cancel confirmed reservation: free time and refund payment
async function cancelConfirmedReservation(reservationId, validate, fields = {}) {
    const reservationRef = db.doc(`reservations/${reservationId}`);

    await db.runTransaction(async (tx) => {
        const reservation = (await tx.get(reservationRef)).data();
        if (!reservation) throw new HttpsError("not-found", "Reservation not found.");
        //Throw HttpsError when caller may not cancel
        validate(reservation);
        if (reservation.status !== "confirmed") {
            throw new HttpsError("failed-precondition", "This reservation can no longer be cancelled.");
        }

        const slotRef = db.doc(`timeslots/${reservation.timeslotId}`);
        const slot = (await tx.get(slotRef)).data();

        tx.update(reservationRef, {
            ...fields,
            status: "cancelled",
            updatedAt: FieldValue.serverTimestamp(),
        });
        //Time becomes available to others again
        if (slot && slot.reservationId === reservationId) {
            tx.update(slotRef, { status: "free", reservationId: null, holdExpiresAt: null });
        }
    });

    //Cancelled even if Stripe fails, retryRefunds will finish the refund
    try {
        await refundReservation(reservationId);
    } catch (e) {
        console.error("Refund failed, will retry", reservationId, e);
    }
}

//Once reservation starts, timeslot is blocked for others
exports.createReservation = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please log in again.");
    const uid = request.auth.uid;

    const timeslotId = request.data?.timeslotId;
    if (typeof timeslotId !== "string" || timeslotId === "") {
        throw new HttpsError("invalid-argument", "Timeslot is missing.");
    }

    const user = (await db.doc(`users/${uid}`).get()).data();
    if (user?.role !== "client") {
        throw new HttpsError("permission-denied", "Only clients can book trainings.");
    }

    //Client can only hold one unfinished transaction at once
    const pending = await db
        .collection("reservations")
        .where("clientId", "==", uid)
        .where("status", "==", "pending")
        .get();
    await Promise.all(pending.docs.map((d) => releaseHold(d.id, "replaced")));

    const slotRef = db.doc(`timeslots/${timeslotId}`);
    const reservationRef = db.collection("reservations").doc();

    const priceCents = await db.runTransaction(async (tx) => {
        //First read, then write
        const slot = (await tx.get(slotRef)).data();
        if (!slot) throw new HttpsError("not-found", "This time is no longer available.");
        if (slot.status !== "free") {
            throw new HttpsError("already-exists", "Someone has just booked this time. Please choose another one or try again later.");
        } 

        const now = Date.now();
        if (slot.startAt.toMillis() <= now) {
            throw new HttpsError("failed-precondition", "This time has already passed.");
        }

        const trainer = (await tx.get(db.doc(`trainers/${slot.trainerId}`))).data();
        if (!trainer || trainer.status !== "approved" || !trainer.active) {
            throw new HttpsError("failed-precondition", "This trainer is not available.");
        }

        //Location is taken from trainer. Admin could have modified it after timeslot creation
        const location = (await
        tx.get(db.doc(`locations/${trainer.locationId}`))).data();
        if (!location || !location.active) {
            throw new HttpsError("failed-precondition", "This location is not available.");
        }

        const holdExpiresAt = Timestamp.fromMillis(now + HOLD_MINUTES * 60 * 1000);

        tx.update(slotRef, { status: "held", reservationId: reservationRef.id, holdExpiresAt });
        tx.set(reservationRef, {
            clientId: uid,
            clientName: `${user.firstName} ${user.lastName}`,
            trainerId: slot.trainerId,
            trainerName: `${trainer.firstName} ${trainer.lastName}`,
            locationId: trainer.locationId,
            locationName: location.name,
            timeslotId,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            startAt: slot.startAt,
            endAt: slot.endAt,
            priceCents: trainer.priceCents,
            status: "pending",
            paymentStatus: "unpaid",
            holdExpiresAt,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
        return trainer.priceCents;
    });

    try {
        const intent = await stripe().paymentIntents.create(
            {
                amount: priceCents,
                currency: CURRENCY,
                automatic_payment_methods: { enabled: true },
                metadata: { reservationId: reservationRef.id },
            },
            { idempotencyKey: `reservation-${reservationRef.id}` }
        );
        await db.doc(`payments/${intent.id}`).set({
            reservationId: reservationRef.id,
            paymentIntentId: intent.id,
            amount: priceCents,
            currency: CURRENCY,
            status: "pending",
            createdAt: FieldValue.serverTimestamp(),
        });
        return { reservationId: reservationRef.id, clientSecret: intent.client_secret };
    } catch (e) {
        console.error("Could not create PaymentIntent", e);
        await releaseHold(reservationRef.id, "payment_error");
        throw new HttpsError("unavailable", "Payment service is unavailable. Please try again later.");
    }
});

//Client cancelled reservation before paying
exports.cancelPendingReservation = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please log in again.");
    
    const reservationId = request.data?.reservationId;
    if (typeof reservationId !== "string" || reservationId === "") {
        throw new HttpsError("invalid-argument", "Reservation is missing.");
    }
    const reservation = (await
        db.doc(`reservations/${reservationId}`).get()).data();
        if (!reservation || reservation.clientId !== request.auth.uid) {
            throw new HttpsError("not-found", "Reservation not found.");
        }
        await releaseHold(reservationId, "cancelled");
        return { ok: true };
});

//Client cancels a paid reservation at least 24h before start
exports.cancelReservation = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please log in again.");

    const reservationId = request.data?.reservationId;
    if (typeof reservationId !== "string" || reservationId === "") {
        throw new HttpsError("invalid-argument", "Reservation is missing.");
    }

    await cancelConfirmedReservation(reservationId, (reservation) => {
        if (reservation.clientId !== request.auth.uid) {
            throw new HttpsError("not-found", "Reservation not found.");
        }
        if (reservation.startAt.toMillis() - Date.now() < CANCEL_HOURS * 3600 * 1000) {
            throw new HttpsError("failed-precondition", `Reservations can only be cancelled at least ${CANCEL_HOURS} hours before the start.`);
        }
    });
    return { ok: true };
});

exports.trainerCancelReservation = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please log in again.");

    const reservationId = request.data?.reservationId;
    if (typeof reservationId !== "string" || reservationId === "") {
        throw new HttpsError("invalid-argument", "Reservation is missing.");
    }
    const reason = typeof request.data?.reason === "string" ? request.data.reason.trim() : "";
    if (reason.length < 3 || reason.length > 200) {
        throw new HttpsError("invalid-argument", "Please enter a reasom (3-200 characters).");
    }

    await cancelConfirmedReservation(
        reservationId, (reservation) => {
            if (reservation.trainerId !== request.auth.uid) {
                throw new HttpsError("not-found", "Reservation not found.");
            }
            if (reservation.startAt.toMillis() <= Date.now()) {
                throw new HttpsError("failed-precondition", "This training has alraedy started.");
            }
        },
        { cancelReason: reason }
    );
    return { ok: true };
});

//Trainer moves reservation to a different time
exports.rescheduleReservation = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please log in again.");
    const uid = request.auth.uid;

    const reservationId = request.data?.reservationId;
    const timeslotId = request.data?.timeslotId;
    if (typeof reservationId !== "string" || reservationId === ""
        || typeof timeslotId !== "string" || timeslotId === "") {
        throw new HttpsError("invalid-argument", "Reservation or time is missing.");
    }

    const reservationRef = db.doc(`reservations/${reservationId}`);
    const newSlotRef = db.doc(`timeslots/${timeslotId}`);

    await db.runTransaction(async (tx) => {
        const reservation = (await tx.get(reservationRef)).data();
        if (!reservation || reservation.trainerId !== uid) {
            throw new HttpsError("not-found", "Reservation not found.");
        }
        if (reservation.status !== "confirmed" || reservation.startAt.toMillis() <= Date.now()) {
            throw new HttpsError("failed-precondition", "This reservation can no longer be rescheduled.");
        }

        const newSlot = (await tx.get(newSlotRef)).data();
        if (!newSlot || newSlot.trainerId !== uid || newSlot.status !== "free") {
            throw new HttpsError("already-exists", "This time is no longer free. Please choose another one.");
        }
        if (newSlot.startAt.toMillis() <= Date.now()) {
            throw new HttpsError("failed-precondition", "This time has already passed.");
        }
        //Client paid for this length, so the new time must be equally long
        const oldLength = reservation.endAt.toMillis() - reservation.startAt.toMillis();
        if (newSlot.endAt.toMillis() - newSlot.startAt.toMillis() !== oldLength) {
            throw new HttpsError("failed-precondition", "Choose a time of the same length.");
        }

        const oldSlotRef = db.doc(`timeslots/${reservation.timeslotId}`);
        const oldSlot = (await tx.get(oldSlotRef)).data();

        tx.update(newSlotRef, { status: "booked", reservationId, holdExpiresAt: null });
        if (oldSlot && oldSlot.reservationId === reservationId) {
            tx.update(oldSlotRef, { status: "free", reservationId: null, holdExpiresAt: null });
        }
        tx.update(reservationRef, {
            timeslotId,
            date: newSlot.date,
            startTime: newSlot.startTime,
            endTime: newSlot.endTime,
            startAt: newSlot.startAt,
            endAt: newSlot.endAt,
            rescheduled: true,
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
    return { ok: true };
});

//Stripe reports payment result
exports.stripeWebhook = onRequest(
    { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
    async (req, res) => {
        let event;
        try {
            event = stripe().webhooks.constructEvent(
                req.rawBody,
                req.headers["stripe-signature"],
                STRIPE_WEBHOOK_SECRET.value()
            );
        } catch (e) {
            console.warn("Invalid webhook signature", e.message);
            res.status(400).send("Invalid signature");
            return;
        }

        const intent = event.data.object;
        const reservationId = intent.metadata?.reservationId;

        try {
            if (reservationId && event.type === "payment_intent.succeeded") {
                await confirmReservation(intent, reservationId);
            }
            if (reservationId && event.type === "payment_intent.payment_failed") {
                await releaseHold(reservationId, "payment_failed");
            }
            res.json({ received: true });
        } catch (e) {
            //Status 500 makes Stripe retry payment
            console.error("Webhook handling failed", event.type, e);
            res.status(500).send("Error");
        }
    }
);

//Every 5 min, free up timeslots where reservation timed out
exports.releaseExpiredHolds = onSchedule(
    { schedule: "every 5 minutes", timeZone: "Europe/Vilnius", secrets: [STRIPE_SECRET_KEY] },
    async () => {
        const snap = await db.collection("reservations").where("status", "==", "pending").get();
        const now = Date.now();
        const expired = snap.docs.filter((d) => d.data().holdExpiresAt.toMillis() <= now);
        await Promise.all(expired.map((d) => releaseHold(d.id, "timeout")));
    }
);

//Delete past days' free timeslots
exports.deletePastFreeSlots = onSchedule(
    { schedule: "every day 03:00", timeZone: "Europe/Vilnius" },
    async () => {
        const today = todayInVilnius();
        const snap = await db.collection("timeslots").where("status", "==", "free").get();
        const past = snap.docs.filter((d) => d.data().date < today);

        for (let i = 0; i < past.length; i += 500) {
            const batch = db.batch();
            past.slice(i, i + 500).forEach((d) => batch.delete(d.ref));
            await batch.commit();
        } 
    }
);

exports.retryRefunds = onSchedule(
    { schedule: "every 30 minutes", timeZone: "Europe/Vilnius", secrets: [STRIPE_SECRET_KEY] },
    async () => {
        const snap = await db
            .collection("reservations")
            .where("status", "==", "cancelled")
            .where("paymentStatus", "==", "paid")
            .get();
        for (const d of snap.docs) {
            await refundReservation(d.id).catch((e) => console.error("Refund retry failed", d.id, e));
        }
    }
);

//Trainer shows QR code for today's confirmed reservation
exports.getCheckInCode = onCall({ secrets: [CHECKIN_SECRET] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please log in again.");

    const reservationId = request.data?.reservationId;
    if (typeof reservationId !== "string" || reservationId === "") {
        throw new HttpsError("invalid-argument", "Reservation is missing.");
    }

    const reservation = (await db.doc(`reservations/${reservationId}`).get()).data();
    if (!reservation || reservation.trainerId !== request.auth.uid) {
        throw new HttpsError("not-found", "Reservation not found.");
    }
    if (reservation.status !== "confirmed") {
        throw new HttpsError("failed-precondition", "This reservation can't be checked in.");
    }
    if (reservation.date !== todayInVilnius()) {
        throw new HttpsError("failed-precondition", "Check-in is only possible on the training day.");
    }

    return { code: `${reservationId}.${checkInSignature(reservationId, reservation.date)}` };
});

//Client scans QR code
exports.checkIn = onCall({ secrets: [CHECKIN_SECRET] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please log in again.");

    const reservationId = request.data?.reservationId;
    const code = request.data?.code;
    if (typeof reservationId !== "string" || reservationId === "" || typeof code !== "string") {
        throw new HttpsError("invalid-argument", "Reservation or code is missing.");
    }

    const [codeReservationId, signature = ""] = code.split(".");
    if (codeReservationId !== reservationId) {
        throw new HttpsError("invalid-argument", "This code is not for this reservation.");
    }

    const reservationRef = db.doc(`reservations/${reservationId}`);

    await db.runTransaction(async (tx) => {
        const reservation = (await tx.get(reservationRef)).data();
        if (!reservation || reservation.clientId !== request.auth.uid) {
            throw new HttpsError("not-found", "Reservation not found.");
        }
        if (reservation.status === "checkedIn") {
            throw new HttpsError("already-exists", "You are already checked in.");
        }
        if (reservation.status !== "confirmed") {
            throw new HttpsError("failed-precondition", "This reservation can't be checked in.");
        }

        //Constant-time comparison, so the signature can't be guessed by timing
        const expected = Buffer.from(checkInSignature(reservationId, reservation.date));
        const given = Buffer.from(signature);
        if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
            throw new HttpsError("invalid-argument", "This code is not valid for your reservation.");
        }
        if (reservation.date !== todayInVilnius()) {
            throw new HttpsError("failed-precondition", `This code is valid on ${reservation.date}.`);
        }

        tx.update(reservationRef, {
            status: "checkedIn",
            checkedInAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
    return { ok: true };
});

//If scanning fails, trainer marks attendance manually
exports.markAttendance = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please log in again.");

    const reservationId = request.data?.reservationId;
    const attended = request.data?.attended;
    if (typeof reservationId !== "string" || reservationId === "" || typeof attended !== "boolean") {
        throw new HttpsError("invalid-argument", "Reservation or attendance is missing.");
    }

    const reservationRef = db.doc(`reservations/${reservationId}`);

    await db.runTransaction(async (tx) => {
        const reservation = (await tx.get(reservationRef)).data();
        if (!reservation || reservation.trainerId !== request.auth.uid) {
            throw new HttpsError("not-found", "Reservation not found.");
        }
        if (reservation.status !== "confirmed") {
            throw new HttpsError("failed-precondition", "Attendance is already marked or the reservation is cancelled.");
        }
        if (reservation.date > todayInVilnius()) {
            throw new HttpsError("failed-precondition", "Attendance can be marked from the training day.");
        }
        if (!attended && reservation.startAt.toMillis() > Date.now()) {
            throw new HttpsError("failed-precondition", "No-show can be marked only after the training starts.");
        }

        tx.update(
            reservationRef,
            attended
                ? { status: "checkedIn", checkedInAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }
                : { status: "noShow", updatedAt: FieldValue.serverTimestamp() }
        );
    });
    return { ok: true };
});

//Admin deleted trainer (includes acc, payments, and reservations)
//Future paid reservations are refunded
exports.deleteTrainer = onCall(
    { secrets: [STRIPE_SECRET_KEY], timeoutSeconds: 300 },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Please log in again.");
        const caller = (await db.doc(`users/${request.auth.uid}`).get()).data();
        if (caller?.role !== "admin") {
            throw new HttpsError("permission-denied", "Only administrators can delete trainers.");
        }

        const trainerId = request.data?.trainerId;
        if (typeof trainerId !== "string" || trainerId === "") {
            throw new HttpsError("invalid-argument", "Trainer is missing.");
        }

        const trainerRef = db.doc(`trainers/${trainerId}`);
        const userRef = db.doc(`users/${trainerId}`);
        const [trainerSnap, userSnap] = await Promise.all([trainerRef.get(), userRef.get()]);
        //Also works when a previous attempt deleted only part of the data
        if (!trainerSnap.exists && userSnap.data()?.role !== "trainer") {
            throw new HttpsError("not-found", "Trainer not found.");
        }

        //1. No new bookings
        if (trainerSnap.exists) {
            await trainerRef.update({ active: false, updatedAt: FieldValue.serverTimestamp() });
        }

        const reservationsQuery = db.collection("reservations").where("trainerId", "==", trainerId);

        //2. Unfinished payments are cancelled, future ones are refunded
        const reservations = await reservationsQuery.get();
        const now = Date.now();
        for (const d of reservations.docs) {
            const r = d.data();
            try {
                if (r.status === "pending") {
                    await releaseHold(d.id, "cancelled");
                } else if (r.status === "confirmed" && r.startAt.toMillis() > now) {
                    await cancelConfirmedReservation(d.id, () => {}, { cancelReason: TRAINER_REMOVED_REASON });
                }
            } catch (e) {
                //Status changed meanwhile (e.g. client cancelled himself) - nothing to do
                if (e.code !== "failed-precondition") throw e;
            }
        }

        //3. Data is deleted only after money is actually returned
        const unrefunded = await reservationsQuery
            .where("status", "==", "cancelled")
            .where("paymentStatus", "==", "paid")
            .get();
        try {
            for (const d of unrefunded.docs) await refundReservation(d.id);
        } catch (e) {
            console.error("Refund failed while deleting trainer", trainerId, e);
            throw new HttpsError(
                "unavailable",
                "Some payments could not be refunded. The trainer is deactivated, please try again later."
            );
        }

        //4. Trainer data
        await deleteDocs((await reservationsQuery.get()).docs);
        await deleteDocs((await db.collection("timeslots").where("trainerId", "==", trainerId).get()).docs);
        await Promise.all([trainerRef.delete(), userRef.delete()]);
        await getStorage().bucket().file(`trainers/${trainerId}/cv.pdf`).delete({ ignoreNotFound: true });
        try {
            await getAuth().deleteUser(trainerId);
        } catch (e) {
            if (e.code !== "auth/user-not-found") throw e;
        }
        return { ok: true };
    }
);