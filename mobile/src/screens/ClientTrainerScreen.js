import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert, StyleSheet } from "react-native";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../services/firebase";
import DayPicker from "../components/DayPicker";
import { getNextDays } from "../utils/dates";
import { formatPrice } from "../utils/price";
import { createReservation } from "../services/reservations";
import { authErrorMessage } from "../utils/authErrors";

export default function ClientTrainerScreen ({ route, navigation }) {
    const { trainerId, locationName } = route.params;
    const days = useMemo(() => getNextDays(7), []);
    const [trainer, setTrainer] = useState(undefined); // undefined - loading, null - unavailable
    const [selectedDay, setSelectedDay] = useState(days[0].key);
    const [slots, setSlots] = useState([]);
    const [slotsLoading, setSlotsLoading] = useState(true);
    const [selectedSlotId, setSelectedSlotId] = useState(null);
    const [booking, setBooking] = useState(false);

    //Real-time profile
    useEffect(() => {
        return onSnapshot(
            doc(db, "trainers", trainerId),
            (snap) => setTrainer(snap.exists() ? { id: snap.id, ...snap.data() } : null),
            () => setTrainer(null)
        );
    }, [trainerId]);

    //Free timeslots - once selected, it's removed from the list
    useEffect(() => {
        setSlotsLoading(true);
        const q = query(
            collection(db, "timeslots"),
            where("trainerId", "==", trainerId),
            where("date", "==", selectedDay),
            where("status", "==", "free")
        );
        return onSnapshot(
            q,
            (snap) => {
                const now = new Date();
                const list = snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .filter((s) => s.startAt.toDate() > now) // FR30: praėję laikai nerodomi
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));
                setSlots(list);
                setSlotsLoading(false);
            },
            () => {
                setSlots([]);
                setSlotsLoading(false);
            }
        );
    }, [trainerId, selectedDay]);

    //If timeslot gone, selection is inactive
    const selectedSlot = slots.find((s) => s.id === selectedSlotId) ?? null;

    function selectDay(key) {
        setSelectedDay(key);
        setSelectedSlotId(null);
    }

    async function handleBook() {
        setBooking(true);
        try {
            const reservationId = await createReservation(selectedSlot.id);
            setSelectedSlotId(null);
            navigation.navigate("Checkout", { reservationId });
        } catch(e) {
            Alert.alert("Booking failed ", authErrorMessage(e));
        } finally {
            setBooking(false);
        }
    }

    if (trainer === undefined) {
        return (
            <View style={styles.center}>
                <ActivityIndicator />
            </View>
        );
    }

    if (trainer === null) {
        return (
            <View style={styles.center}>
                <Text style={styles.muted}>This trainer is no longer available.</Text>
            </View>
        );
    }

    return (
        <View style={styles.screen}>
            <ScrollView contentContainerStyle={styles.container}>
                <View style={styles.card}>
                    <Text style={styles.name}>
                        {trainer.firstName} {trainer.lastName}
                    </Text>
                    <Text style={styles.specialization}>{trainer.specialization}</Text>
                    <Text style={styles.muted}>
                        <Text style={styles.price}>{formatPrice(trainer.priceCents)}</Text> / session · {locationName}
                    </Text>

                    {!!trainer.description && <Text style={styles.body}>{trainer.description}</Text>}

                    <View style={styles.section}>
                        <Text style={styles.label}>Education</Text>
                        <Text style={styles.body}>{trainer.education}</Text>
                    </View>
                </View>

                <Text style={styles.sectionTitle}>Available times</Text>
                <DayPicker days={days} value={selectedDay} onChange={selectDay} />

                {slotsLoading ? (
                    <ActivityIndicator />
                ) : slots.length === 0 ? (
                    <Text style={styles.muted}>No free times on this day.</Text>
                ) : (
                    <View style={styles.slots}>
                        {slots.map((slot) => {
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
                    style={[styles.button, (!selectedSlot || booking) && styles.buttonDisabled]}
                    onPress={handleBook}
                    disabled={!selectedSlot || booking}
                >
                    {booking ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>
                            {selectedSlot ? `Book ${selectedSlot.startTime}-${selectedSlot.endTime}` : "Choose a time"}
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
        gap: 8,
    },
    name: { fontSize: 22, fontWeight: "700", color: "#111827" },
    specialization: { fontSize: 16, color: "#374151" },
    price: { fontWeight: "700", color: "#111827" },
    body: { fontSize: 15, color: "#374151", lineHeight: 21 },
    section: { gap: 2, marginTop: 4 },
    label: { fontSize: 13, fontWeight: "600", color: "#6b7280" },
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