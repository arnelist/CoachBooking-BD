import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet } from "react-native";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase";
import { cancelPendingReservation } from "../services/reservations";
import { formatPrice } from "../utils/price";

//ms -> m:ss
function formatCountdown(ms) {
    const seconds = Math.ceil(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function ClientCheckoutScreen({ route, navigation }) {
    const { reservationId } = route.params;
    const [reservation, setReservation] = useState(undefined); // undefined - loading, null - not found
    const [now, setNow] = useState(Date.now());

    //Real-time, screen updates when server changes status
    useEffect(() => {
        return onSnapshot(
            doc(db, "reservations", reservationId),
            (snap) => setReservation(snap.exists() ? { id: snap.id, ...snap.data() } : null),
            () => setReservation(null)
        );
    }, [reservationId]);

    //Timer
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    const isPending = reservation?.status === "pending";

    //Leaving w/o paying, timeslot frees up
    useEffect(() => {
        if (!isPending) return;
        return navigation.addListener("beforeRemove", () => {
            cancelPendingReservation(reservationId).catch(() => {});
        });
    }, [navigation, isPending, reservationId]);

    if (reservation === null) {
        return (
            <View style={styles.center}>
                <Text style={styles.muted}>Reservation not found.</Text>
            </View>
        );
    }

    if (reservation === undefined) {
        return (
            <View style={styles.center}>
                <ActivityIndicator />
            </View>
        );
    }

    const remaining = Math.max(0, reservation.holdExpiresAt.toMillis() - now);
    const canPay = isPending && remaining > 0;

    //Stripe
    function handlePay() {
        Alert.alert("Coming soon. Payments will be added in the next update.");
    }

    return (
        <View style={styles.screen}>
            <View style={styles.container}>
                <View style={styles.card}>
                    <Row label="Trainer" value={reservation.trainerName} />
                    <Row label="Location" value={reservation.locationName} />
                    <Row label="Date" value={reservation.date} />
                    <Row label="Time" value={`${reservation.startTime}–${reservation.endTime}`} />
                    <Row label="Price" value={formatPrice(reservation.priceCents)} />
                </View>

                {canPay ? (
                    <Text style={styles.muted}>
                        This time is reserved for you for <Text style={styles.bold}>{formatCountdown(remaining)}</Text>.
                    </Text>
                ) : (
                    <Text style={styles.error}>Reservation time has expired. Please choose the time again.</Text>
                )}
            </View>

            <View style={styles.footer}>
                <Pressable
                    style={[styles.button, !canPay && styles.buttonDisabled]}
                    onPress={handlePay}
                    disabled={!canPay}
                >
                    <Text style={styles.buttonText}>Pay {formatPrice(reservation.priceCents)}</Text>
                </Pressable>
                <Pressable style={styles.secondary} onPress={() => navigation.goBack()}>
                    <Text style={styles.secondaryText}>{canPay ? "Cancel" : "Back"}</Text>
                </Pressable>
            </View>
        </View>
    );

    function Row({ label, value }) {
        return (
            <View style={styles.row}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.value}>{value}</Text>
            </View>
        );
    }
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    container: { flex: 1, padding: 16, gap: 12 },
    card: {
        backgroundColor: "#fff",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        padding: 16,
        gap: 12,
    },
    row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    label: { color: "#6b7280" },
    value: { fontWeight: "600", color: "#111827", flexShrink: 1, textAlign: "right" },
    muted: { color: "#6b7280" },
    bold: { fontWeight: "700", color: "#111827" },
    error: { color: "#dc2626" },
    footer: {
        padding: 16,
        gap: 8,
        borderTopWidth: 1,
        borderTopColor: "#e5e7eb",
        backgroundColor: "#fff",
    },
    button: { backgroundColor: "#111827", padding: 14, borderRadius: 8, alignItems: "center" },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
    secondary: { padding: 12, alignItems: "center" },
    secondaryText: { color: "#111827", fontWeight: "600", fontSize: 16 },
});