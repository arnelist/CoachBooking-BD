const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

setGlobalOptions({ region: "europe-central2", maxInstances: 10 });

const HOLD_MINUTES = 10;
const KEEP_EXPIRED_DAYS = 7;

//Transaction so that reservation and timeslot change at once
async function releaseHold(reservationId, reason) {
    const reservationRef = db.doc(`reservations/${reservationId}`);

    await db.runTransaction(async (tx) => {
        const reservation = (await tx.get(reservationRef)).data();
        if (!reservation || reservation.status !== "pending") return; //paid or undone

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
    });
}

//Once reservation starts, timeslot is blocked for others
exports.createReservation = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please log in again.");
    const uid = request.auth.uid;

    const timeslotId = request.data?.timeslotId;
    if (typeof timeslotId !== "string" || timeslotId === "") {
        throw new HttpsError("invalid-argument", "Timeslot is missing.");
    }

    const user = (await db.doc(`users/${uid}`). get()).data();
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

    await db.runTransaction(async (tx) => {
        //First read, then write
        const slot = (await tx.get(slotRef)).data();
        if (!slot) throw new HttpsError("not-found", "This time is no longer available.");
        if (slot.status !== "free") {
            throw new HttpsError("already-exists", "Someone has just booked this time. Please choose another one opr try again later.");
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
    });

    return { reservationId: reservationRef.id };
});

//Client cancelled reservation before paying
exports.cancelPendingReservation = onCall(async (request) => {
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

//Every 5 min, free up timeslots where reservation timed out
exports.releaseExpiredHolds = onSchedule(
    { schedule: "every 5 minutes", timeZone: "Europe/Vilnius" },
    async () => {
        const snap = await db.collection("reservations").where("status", "==", "pending").get();
        const now = Date.now();
        const expired = snap.docs.filter((d) => d.data().holdExpiresAt.toMillis() <= now);
        await Promise.all(expired.map((d) => releaseHold(d.id, "timeout")));
    }
);