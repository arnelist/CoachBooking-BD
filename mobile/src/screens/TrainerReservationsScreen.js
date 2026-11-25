import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from "react-native";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import DayPicker from "../components/DayPicker";
import Select from "../components/Select";
import ReservationBadges from "../components/ReservationBadges";
import { getNextDays } from "../utils/dates";
import { authErrorMessage } from "../utils/authErrors";

//pending and expired are unfinished bookings, the Schedule tab shows them as "Payment pending"
const VISIBLE = ["confirmed", "checkedIn", "noShow", "cancelled"];

const STATUS_OPTIONS = [
    { value: "all", label: "Status: all" },
    { value: "confirmed", label: "Confirmed" },
    { value: "checkedIn", label: "Attended" },
    { value: "noShow", label: "No-show" },
    { value: "cancelled", label: "Cancelled" },
];

export default function TrainerReservationsScreen({ navigation }) {
    const { user } = useAuth();
    const days = useMemo(() => getNextDays(7), []);
    const [selectedDay, setSelectedDay] = useState(days[0].key);
    const [status, setStatus] = useState("all");
    const [reservations, setReservations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    //Real-time, client cancellations appear immediately
    useEffect(() => {
        setLoading(true);
        setError("");
        const q = query(
            collection(db, "reservations"),
            where("trainerId", "==", user.uid),
            where("date", "==", selectedDay)
        );
        return onSnapshot(
            q,
            (snap) => {
                const list = snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .filter((r) => VISIBLE.includes(r.status))
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));
                setReservations(list);
                setLoading(false);
            },
            (e) => {
                setError(authErrorMessage(e));
                setLoading(false);
            }
        );
    }, [user.uid, selectedDay]);

    const list = status === "all" ? reservations : reservations.filter((r) => r.status === status);
    const now = Date.now();

    return (
        <FlatList
            data={loading ? [] : list}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
                <View style={styles.header}>
                    <DayPicker days={days} value={selectedDay} onChange={setSelectedDay} />
                    <Select options={STATUS_OPTIONS} value={status} onChange={setStatus} />
                </View>
            }
            ListEmptyComponent={
                loading ? (
                    <ActivityIndicator />
                ) : (
                    <Text style={styles.muted}>{error || "No reservations on this day."}</Text>
                )
            }
            renderItem={({ item }) => {
                const canEdit = item.status === "confirmed" && item.startAt.toMillis() > now;
                const canCheckIn = item.status === "confirmed" && item.date === days[0].key;
                return (
                    <View style={styles.card}>
                        <Text style={styles.title}>
                            {item.startTime}–{item.endTime} · {item.clientName}
                        </Text>
                        <ReservationBadges reservation={item} showPayment={false} />
                        {!!item.cancelReason && (
                            <Text style={styles.subtitle}>Reason: {item.cancelReason}</Text>
                        )}

                        {(canEdit || canCheckIn) && (
                            <View style={styles.actions}>
                                {canEdit && (
                                    <>
                                        <Pressable
                                            style={styles.outline}
                                            onPress={() => navigation.navigate("Reschedule", { reservationId: item.id })}
                                        >
                                            <Text style={styles.outlineText}>Reschedule</Text>
                                        </Pressable>
                                        <Pressable
                                            style={styles.outline}
                                            onPress={() => navigation.navigate("CancelReservation", { reservationId: item.id })}
                                        >
                                            <Text style={styles.outlineText}>Cancel</Text>
                                        </Pressable>
                                    </>
                                )}
                                {canCheckIn && (
                                    <Pressable
                                        style={[styles.outline, styles.dark]}
                                        onPress={() => navigation.navigate("CheckIn", { reservationId: item.id })}
                                    >
                                        <Text style={[styles.outlineText, styles.darkText]}>Check-in</Text>
                                    </Pressable>
                                )}
                            </View>
                        )}
                    </View>
                );
            }}
        />
    );
}

const styles = StyleSheet.create({
    list: { padding: 16, gap: 10 },
    header: { gap: 10, marginBottom: 2 },
    muted: { color: "#6b7280", textAlign: "center", marginTop: 24 },
    card: {
        backgroundColor: "#fff",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        padding: 16,
        gap: 8,
    },
    title: { fontSize: 16, fontWeight: "700", color: "#111827" },
    subtitle: { color: "#6b7280" },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
    outline: {
        flexGrow: 1,
        minWidth: 100,
        borderWidth: 1,
        borderColor: "#111827",
        borderRadius: 8,
        padding: 12,
        alignItems: "center",
    },
    outlineText: { fontWeight: "600", color: "#111827" },
    dark: { backgroundColor: "#111827" },
    darkText: { color: "#fff" },
});