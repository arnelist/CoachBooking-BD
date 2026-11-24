import {
    Timestamp,
    addDoc,
    collection,
    deleteDoc,
    doc,
    serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { toDate } from "../utils/dates";

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