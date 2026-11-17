import {
    Timestamp,
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    query,
    serverTimestamp,
    where,
    writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { toDate, todayKey } from "../utils/dates";

export function createTimeslot({ trainerId, locationId, date, startTime, endTime }) {
    return addDoc(collection(db, "timeslots"), {
        trainerId,
        locationId,
        date,
        startTime,
        endTime,
        startAt: Timestamp.fromDate(toDate(date, startTime)),
        endAt: Timestamp.fromDate(toDate(date, endTime)),
        status: "free",
        reservationId: null,
        holdExpiresAt: null,
        createdAt: serverTimestamp(),
    });
}

export function deleteTimeslot(id) {
    return deleteDoc(doc(db, "timeslots", id));
}

//Deletes previous day free timeslots. Reserved ones are kept.
export async function deletePastFreeSlots(trainerId) {
    const q = query(
    collection(db, "timeslots"),
    where("trainerId", "==", trainerId),
    where("status", "==", "free")
    );
    const snap = await getDocs(q);
    const today = todayKey();
    const past = snap.docs.filter((d) => d.data().date < today);
    if (past.length === 0) return 0;

    const batch = writeBatch(db);
    past.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return past.length;
}