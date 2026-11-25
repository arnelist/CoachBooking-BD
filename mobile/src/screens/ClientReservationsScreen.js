import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator, Alert, StyleSheet } from "react-native";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import { cancelReservation } from "../services/reservations";
import ReservationBadges from "../components/ReservationBadges";
import { formatPrice } from "../utils/price";
import { authErrorMessage } from "../utils/authErrors";
import { toDateKey } from "../utils/dates";

const CANCEL_HOURS = 24;
//pending and expired are unfinished bookings, not shown to the client
const VISIBLE = ["confirmed", "checkedIn", "noShow", "cancelled"];

export default function ClientReservationsScreen({ navigation }) {
    const { user } = useAuth();
    const [reservations, setReservations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [tab, setTab] = useState("upcoming");
    const [now, setNow] = useState(Date.now());
    const [cancellingId, setCancellingId] = useState(null);

    //Real-time, status changes from the server appear instantly
    useEffect(() => {
        const q = query(collection(db, "reservations"), where("clientId", "==", user.uid));
        return onSnapshot(
            q,
            (snap) => {
                const list = snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .filter((r) => VISIBLE.includes(r.status));
                setReservations(list);
                setLoading(false);
            },
            (e) => {
                setError(authErrorMessage(e));
                setLoading(false);
            }
        );
    }, [user.uid]);

    //once per minute: finished trainings move to Past, Cancel hides after 24hrs
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
        return () => clearInterval(timer);
    }, []);

    const list = useMemo(() => {
        const upcoming = tab === "upcoming";
        return reservations
            .filter((r) => r.endAt.toMillis() > now === upcoming)
            .sort((a, b) => 
                upcoming
                    ? a.startAt.toMillis() - b.startAt.toMillis()
                    : b.startAt.toMillis() - a.startAt.toMillis()
            );
    }, [reservations, tab, now]);

    function canCancel(r) {
        return r.status === "confirmed" && r.startAt.toMillis() - now >= CANCEL_HOURS * 3600 * 1000;
    }

    const today = toDateKey(new Date(now));

    function confirmCancel(r) {
        Alert.alert(
            "Cancel reservation?",
            `${r.date}, ${r.startTime}-${r.endTime} with ${r.trainerName}.\n${formatPrice(r.priceCents)} will be refunded to your card.`,
            [
                { text: "Keep", style: "cancel" },
                { text: "Cancel reservation", style: "destructive", onPress: () => handleCancel(r.id) },
            ]
        );
    }

    async function handleCancel(id) {
        setCancellingId(id);
        try {
            await cancelReservation(id);
        } catch (e) {
            Alert.alert("Cancellation failed", authErrorMessage(e));
        } finally {
            setCancellingId(null);
        }
    }

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator />
            </View>
        );
    }

    return (
        <View style={styles.screen}>
            <View style={styles.tabs}>
                <TabButton label="Upcoming" active={tab === "upcoming"} onPress={() => setTab("upcoming")} />
                <TabButton label="Past" active={tab === "past"} onPress={() => setTab("past")} />
            </View>

            <FlatList
                data={list}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                    <Text style={styles.muted}>
                        {error || (tab === "upcoming" ? "No upcoming reservations." : "No past reservations.")}
                    </Text>
                }
                renderItem={({ item }) => (
                    <View style={styles.card}>
                        <Text style={styles.title}>
                            {item.date}, {item.startTime}–{item.endTime}
                        </Text>
                        <Text style={styles.subtitle}>
                            {item.trainerName} · {item.locationName}
                        </Text>
                        <ReservationBadges reservation={item} />
                        {!!item.cancelReason && (
                            <Text style={styles.subtitle}>Reason: {item.cancelReason}</Text>
                        )}

                        {item.status === "confirmed" && item.date === today ? (
                            <Pressable
                                style={styles.outline}
                                onPress={() => navigation.navigate("CheckIn", { reservationId: item.id })}
                            >
                                <Text style={styles.outlineText}>Check in</Text>
                            </Pressable>
                        ) : canCancel(item) ? (
                            <Pressable
                                style={[styles.outline, cancellingId !== null && styles.disabled]}
                                onPress={() => confirmCancel(item)}
                                disabled={cancellingId !== null}
                            >
                                {cancellingId === item.id ? (
                                    <ActivityIndicator />
                                ) : (
                                    <Text style={styles.outlineText}>Cancel reservation</Text>
                                )}
                            </Pressable>
                        ) : item.status === "confirmed" && tab === "upcoming" ? (
                            <Text style={styles.hint}>
                                Can't be cancelled less than {CANCEL_HOURS} h before the start.
                            </Text>
                        ) : null}
                    </View>
                )}
            />
        </View>

    );
}

function TabButton({ label, active, onPress }) {
    return (
        <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },

    tabs: {
        flexDirection: "row",
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "#e5e7eb",
    },
    tab: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: 2,
        borderBottomColor: "transparent",
    },
    tabActive: { borderBottomColor: "#111827" },
    tabText: { fontSize: 15, fontWeight: "600", color: "#9ca3af" },
    tabTextActive: { color: "#111827" },

    list: { padding: 16, gap: 10 },
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
    hint: { fontSize: 13, color: "#9ca3af" },
    muted: { color: "#6b7280", textAlign: "center", marginTop: 24 },

    outline: {
        borderWidth: 1,
        borderColor: "#111827",
        borderRadius: 8,
        padding: 12,
        alignItems: "center",
        marginTop: 4,
    },
    outlineText: { fontWeight: "600", color: "#111827" },
    disabled: { opacity: 0.4 },
});