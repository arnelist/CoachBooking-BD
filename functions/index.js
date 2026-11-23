const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const Stripe = require("stripe");

initializeApp();
const db = getFirestore();

setGlobalOptions({ region: "europe-central2", maxInstances: 10 });

//Secret keys exist only in the functions environment
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

const HOLD_MINUTES = 10;
const KEEP_EXPIRED_DAYS = 7;
const CURRENCY = "eur";
const CANCEL_HOURS = 24;

function stripe() {
    return new Stripe(STRIPE_SECRET_KEY.value());
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

    const reservationRef = db.doc(`reservations/${reservationId}`);

    await db.runTransaction(async (tx) => {
        const reservation = (await tx.get(reservationRef)).data();
        if (!reservation || reservation.clientId !== request.auth.uid) {
            throw new HttpsError("failed-precondition", "Reservation not found.");
        }
        if (reservation.status !== "confirmed") {
            throw new HttpsError("failed-precondition", "This reservation can no longer be cancelled.");
        }
        if (reservation.startAt.toMillis() - Date.now() < CANCEL_HOURS * 3600 * 1000) {
            throw new HttpsError("failed-precondition", `Reservations can only be cancelled at least ${CANCEL_HOURS} hours before the start.`);
        }

        const slotRef = db.doc(`timeslots/${reservation.timeslotId}`);
        const slot = (await tx.get(slotRef)).data();

        tx.update(reservationRef, {
            status: "cancelled",
            updatedAt: FieldValue.serverTimestamp(),
        });

        //Time becomes available to others again
        if (slot && slot.reservationId === reservationId) {
            tx.update(slotRef, { status: "free", reservationId: null, holdExpiresAt: null });
        }
    })

    try {
        await refundReservation(reservationId);
    } catch (e) {
        console.error("Refund failed, will retry", reservationId, e);
    }
    return { ok: true };
})

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
        const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vilnus" }).format(new Date());
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
        for (const d in snap.docs) {
            await refundReservation(d.id).catch((e) => console.error("Refund retry failed", d.id, e));
        }
    }
);