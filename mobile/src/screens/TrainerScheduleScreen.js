import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import Select from "../components/Select";
import { createTimeslot, deletePastFreeSlots, deleteTimeslot } from "../services/timeslots";
import { getNextDays, minutesToTime, timeToMinutes, toDate } from "../utils/dates";
import { authErrorMessage } from "../utils/authErrors";
import DayPicker from "../components/DayPicker";

const DAYS_AHEAD = 7;
const FIRST_START = 6 * 60;
const LAST_START = 23 * 60;
const STEP = 30;

const ALL_START_OPTIONS = [];
for (let m = FIRST_START; m <= LAST_START; m += STEP) {
    ALL_START_OPTIONS.push({ value: minutesToTime(m), label: minutesToTime(m) });
}

const DURATION_OPTIONS = [30, 45, 60, 90, 120].map((min) => ({ value: min, label: `${min} min` }));

const STATUS = {
    free: { label: "Free", bg: "#dcfce7", color: "#166534" },
    held: { label: "Payment pending", bg: "#fef3c7", color: "#92400e" },
    booked: { label: "Booked", bg: "#dbeafe", color: "#1e40af" },
    past: { label: "Past", bg: "#f3f4f6", color: "#6b7280" },
};

function overlaps(slots, start, end) {
    const s = timeToMinutes(start);
    const e = timeToMinutes(end);
    return slots.some((slot) => s < timeToMinutes(slot.endTime) && timeToMinutes(slot.startTime) < e)
}

export default function TrainerScheduleScreen() {
    const { user, trainer } = useAuth();
    const days = useMemo(() => getNextDays(DAYS_AHEAD), []);
    const [selectedDay, setSelectedDay] = useState(days[0].key);
    const [slots, setSlots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [startTime, setStartTime] = useState(null);
    const [duration, setDuration] = useState(60);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        deletePastFreeSlots(user.uid).catch((e) => console.log("Cleanup failed: ", e.code));
    }, [user.uid]);

    useEffect(() => {
        setLoading(true);
        const q = query(
            collection(db, "timeslots"),
            where("trainerId", "==", user.uid),
            where("date", "==", selectedDay)
        );
        return onSnapshot(
            q,
            (snap) => {
                const list = snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));
                setSlots(list);
                setLoading(false);
            },
            (e) => {
                setError(authErrorMessage(e));
                setLoading(false);
            }
        );
    }, [user.uid, selectedDay]);

    //Do not show past days
    const isToday = selectedDay === days[0].key;
    const startOptions = useMemo(() => {
        if (!isToday) return ALL_START_OPTIONS;
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        return ALL_START_OPTIONS.filter((o) => timeToMinutes(o.value) > nowMinutes);
    }, [isToday]);

    const endTime = startTime ? minutesToTime(timeToMinutes(startTime) + duration) : null;

    function selectDay(key) {
        setSelectedDay(key);
        setStartTime(null);
        setError("");
    }

    async function handleAdd() {
        setError("");
        if (!startTime) {
            setError("Choose a start time.");
            return;
        }
        if (toDate(selectedDay, startTime) <= new Date()) {
            setError("This start time has already passed.");
            return;
        }
        if (timeToMinutes(startTime) + duration >= 24 * 60) {
            setError("The slot must end before midnight.");
            return;
        }
        if (overlaps(slots, startTime, endTime)) {
            setError(`${startTime}–${endTime} overlaps another slot.`);
            return;
        }
        setSaving(true);
        try {
            await createTimeslot({
                trainerId: user.uid,
                locationId: trainer.locationId,
                date: selectedDay,
                startTime,
                endTime,
            });
            setStartTime(null);
        } catch (e) {
            setError(authErrorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    function handleDelete(slot) {
        Alert.alert("Delete slot?", `${slot.startTime}-${slot.endTime}`, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    try {
                        await deleteTimeslot(slot.id);
                    } catch (e) {
                        setError(authErrorMessage(e));
                    }
                },
            },
        ]);
    }

    return (
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <DayPicker days={days} value={selectedDay} onChange={selectDay} />

            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Add a slot</Text>
                <Select
                label="Start time"
                placeholder="Choose start time"
                options={startOptions}
                value={startTime}
                onChange={setStartTime}
                emptyText="No more start times today"
                />
                <Select label="Duration" options={DURATION_OPTIONS} value={duration} onChange={setDuration} />
                {!!startTime && (
                <Text style={styles.muted}>
                    Slot: {startTime}–{endTime}
                </Text>
                )}
                {!!error && <Text style={styles.error}>{error}</Text>}
                <Pressable
                style={[styles.button, saving && styles.buttonDisabled]}
                onPress={handleAdd}
                disabled={saving}
                >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Add slot</Text>}
                </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Slots</Text>
            {loading ? (
                <ActivityIndicator />
            ) : slots.length === 0 ? (
                <Text style={styles.muted}>No slots for this day yet.</Text>
            ) : (
                slots.map((slot) => {
                const past = slot.endAt.toDate() < new Date();
                const status = STATUS[past && slot.status === "free" ? "past" : slot.status];
                return (
                    <View key={slot.id} style={[styles.slot, past && styles.slotPast]}>
                    <View style={styles.slotInfo}>
                        <Text style={styles.slotTime}>
                        {slot.startTime}–{slot.endTime}
                        </Text>
                        <View style={[styles.badge, { backgroundColor: status.bg }]}>
                        <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
                        </View>
                    </View>
                    {slot.status === "free" && (
                        <Pressable onPress={() => handleDelete(slot)} hitSlop={10}>
                        <Ionicons name="trash-outline" size={20} color="#dc2626" />
                        </Pressable>
                    )}
                    </View>
                );
                })
            )}
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    container: { padding: 16, gap: 12 },
    card: {
        backgroundColor: "#fff",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        padding: 16,
        gap: 12,
    },
    sectionTitle: { fontSize: 16, fontWeight: "700" },
    muted: { color: "#6b7280" },
    error: { color: "#dc2626" },

    button: { backgroundColor: "#111827", padding: 14, borderRadius: 8, alignItems: "center" },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },

    slot: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: "#fff",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        padding: 12,
    },
    slotPast: { opacity: 0.5 },
    slotInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
    slotTime: { fontSize: 16, fontWeight: "600" },
    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
    badgeText: { fontSize: 12, fontWeight: "600" },
});