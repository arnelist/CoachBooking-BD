import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert, StyleSheet } from "react-native";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import DayPicker from "../components/DayPicker";
import { getNextDays, timeToMinutes } from "../utils/dates";
import { rescheduleReservation } from "../services/reservations";
import { authErrorMessage } from "../utils/authErrors";

const lengthOf = (item) => timeToMinutes(item.endTime) - timeToMinutes(item.startTime);

export default function TrainerRescheduleScreen({ route, navigation }) {
    const { reservationId } = route.params;
    const { user } = useAuth();
    const days = useMemo(() => getNextDays(7), []);
    const [reservation, setReservation] = useState(undefined); // undefined - loading, null - not found
    const [selectedDay, setSelectedDay] = useState(days[0].key);
    const [slots, setSlots] = useState([]);
    const [slotsLoading, setSlotsLoading] = useState(true);
    const [selectedSlotId, setSelectedSlotId] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        return onSnapshot(
            doc(db, "reservations", reservationId),
            (snap) => setReservation(snap.exists() ? { id: snap.id, ...snap.data() } : null),
            () => setReservation(null)
        );
    }, [reservationId]);

    //Own free times of the selected day
    useEffect(() => {
        setSlotsLoading(true);
        const q = query(
            collection(db, "timeslots"),
            where("trainerId", "==", user.uid),
            where("date", "==", selectedDay),
            where("status", "==", "free")
        );
        return onSnapshot(
            q,
            (snap) => {
                const now = new Date();
                const list = snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .filter((s) => s.startAt.toDate() > now)
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));
                setSlots(list);
                setSlotsLoading(false);
            },
            () => {
                setSlots([]);
                setSlotsLoading(false);
            }
        );
    }, [user.uid, selectedDay]);

    function selectDay(key) {
        setSelectedDay(key);
        setSelectedSlotId(null);
    }

    async function handleSave() {
        setSaving(true);
        try {
            await rescheduleReservation(reservationId, selectedSlot.id);
            navigation.goBack();
        } catch (e) {
            Alert.alert("Reschedule failed", authErrorMessage(e));
            setSaving(false);
        }
    }

    if (reservation === undefined) {
        return (
            <View style={styles.center}>
                <ActivityIndicator />
            </View>
        );
    }

    if (reservation === null || reservation.status !== "confirmed") {
        return (
            <View style={styles.center}>
                <Text style={styles.muted}>This reservation can no longer be rescheduled.</Text>
            </View>
        );
    }

    //Cliehnt paid for this length, so equally long times are offered
    const length = lengthOf(reservation);
    const options = slots.filter((s) => lengthOf(s) === length);
    const selectedSlot = options.find((s) => s.id === selectedSlotId) ?? null;

    return (
        <View style={styles.screen}>
            <ScrollView contentContainerStyle={styles.container}>
                <View style={styles.card}>
                    <Text style={styles.label}>Current time</Text>
                    <Text style={styles.title}>
                        {reservation.date}, {reservation.startTime}–{reservation.endTime}
                    </Text>
                    <Text style={styles.muted}>{reservation.clientName}</Text>
                </View>

                <Text style={styles.sectionTitle}>New time</Text>
                <DayPicker days={days} value={selectedDay} onChange={selectDay} />

                {slotsLoading ? (
                    <ActivityIndicator />
                ) : options.length === 0 ? (
                    <Text style={styles.muted}>
                        No free {length} min times on this day. Add one in the Schedule tab.
                    </Text>
                ) : (
                    <View style={styles.slots}>
                        {options.map((slot) => {
                            const active = slot.id === selectedSlotId;
                            return (
                                <Pressable
                                    key={slot.id}
                                    onPress={() => setSelectedSlotId(slot.id)}
                                    style={[styles.slot, active && styles.slotActive]}
                                >
                                    <Text style={[styles.slotText, active && styles.textOnDark]}>
                                        {slot.startTime}–{slot.endTime}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                )}
            </ScrollView>

            <View style={styles.footer}>
                <Pressable
                    style={[styles.button, (!selectedSlot || saving) && styles.buttonDisabled]}
                    onPress={handleSave}
                    disabled={!selectedSlot || saving}
                >
                    {saving ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>
                            {selectedSlot ? `Move to ${selectedSlot.startTime}–${selectedSlot.endTime}` : "Choose a new time"}
                        </Text>
                    )}
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    container: { padding: 16, gap: 12 },
    card: {
        backgroundColor: "#fff",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        padding: 16,
        gap: 4,
    },
    label: { fontSize: 13, fontWeight: "600", color: "#6b7280" },
    title: { fontSize: 16, fontWeight: "700", color: "#111827" },
    muted: { color: "#6b7280" },
    sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 4 },
    slots: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    slot: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#d1d5db",
        backgroundColor: "#fff",
    },
    slotActive: { backgroundColor: "#111827", borderColor: "#111827" },
    slotText: { fontSize: 15, fontWeight: "600", color: "#111827" },
    textOnDark: { color: "#fff" },
    footer: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: "#e5e7eb",
        backgroundColor: "#fff",
    },
    button: { backgroundColor: "#111827", padding: 14, borderRadius: 8, alignItems: "center" },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});