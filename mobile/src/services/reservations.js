import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

const createReservationFn = httpsCallable(functions, "createReservation");
const cancelPendingReservationFn = httpsCallable(functions, "cancelPendingReservation");
const cancelReservationFn = httpsCallable(functions, "cancelReservation");
const rescheduleReservationFn = httpsCallable(functions, "rescheduleReservation");
const trainerCancelReservationFn = httpsCallable(functions, "trainerCancelReservation");

export async function createReservation(timeslotId) {
    const { data } = await createReservationFn({ timeslotId });
    return data;
}

export function cancelPendingReservation(reservationId) {
    return cancelPendingReservationFn({ reservationId });
}

export function cancelReservation(reservationId) {
    return cancelReservationFn({ reservationId });
}

export function rescheduleReservation(reservationId, timeslotId) {
    return rescheduleReservationFn({ reservationId, timeslotId });
}

export function trainerCancelReservation(reservationId, reason) {
    return trainerCancelReservationFn({ reservationId, reason });
}