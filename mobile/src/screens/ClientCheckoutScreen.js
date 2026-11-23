import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet } from "react-native";
import { doc, onSnapshot } from "firebase/firestore";
import { useStripe } from "@stripe/stripe-react-native";
import * as Linking from "expo-linking";
import { db } from "../services/firebase";
import { cancelPendingReservation } from "../services/reservations";
import { formatPrice } from "../utils/price";

//ms -> m:ss
function formatCountdown(ms) {
    const seconds = Math.ceil(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function ClientCheckoutScreen({ route, navigation }) {
    const { reservationId, clientSecret } = route.params;
    const { initPaymentSheet, presentPaymentSheet } = useStripe();
    const [reservation, setReservation] = useState(undefined); // undefined - loading, null - not found
    const [now, setNow] = useState(Date.now());
    const [sheetReady, setSheetReady] = useState(false);
    const [paying, setPaying] = useState(false);

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

    //Stripe payment form, card data -> only to stripe
    useEffect(() => {
        initPaymentSheet({
            paymentIntentClientSecret: clientSecret,
            merchantDisplayName: "CoachBooking",
            returnURL: Linking.createURL("stripe-redirect"),
        }).then(({ error }) => {
            if (error) Alert.alert("Payment unavailable", error.message);
            else setSheetReady(true);
        });
    }, [clientSecret, initPaymentSheet]);

    const isPending = reservation?.status === "pending";
    const isConfirmed = reservation?.status === "confirmed";

    //Server confirmed or annulled - stop waiting
    useEffect(() => {
        if (!isPending) setPaying(false);
    }, [isPending]);

    //Leaving w/o paying, timeslot frees up
    useEffect(() => {
        if (!isPending) return;
        return navigation.addListener("beforeRemove", () => {
            cancelPendingReservation(reservationId).catch(() => {});
        });
    }, [navigation, isPending, reservationId]);

    //Stripe
    async function handlePay() {
        setPaying(true);
        const {error} = await presentPaymentSheet();
        if (error) {
            setPaying(false);
            if (error.code !== "Canceled") Alert.alert("Payment failed", error.message);
        }
    }
    
    if (reservation === undefined) {
        return (
            <View style={styles.center}>
                <ActivityIndicator />
            </View>
        );
    }

    if (reservation === null) {
        return (
            <View style={styles.center}>
                <Text style={styles.muted}>Reservation not found.</Text>
            </View>
        );
    }

    if (isConfirmed) {
        return (
            <View style={styles.center}>
                <Text style={styles.successTitle}>Booking confirmed</Text>
                <Text style={styles.muted}>
                    {reservation.trainerName} · {reservation.date}, {reservation.startTime}–{reservation.endTime}
                </Text>
                <Pressable style={[styles.button, styles.fullWidth]} onPress={() => navigation.popToTop()}>
                    <Text style={styles.buttonText}>Done</Text>
                </Pressable>
            </View>
        );
    }

    const remaining = Math.max(0, reservation.holdExpiresAt.toMillis() - now);
    const canPay = isPending && remaining > 0 && sheetReady && !paying;

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

                {paying ? (
                    <Text style={styles.muted}>Confirming payment...</Text>
                ) : isPending && remaining > 0 ? (
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
                    {paying ? (
                        <ActivityIndicator color="#fff"/>
                    ) : (
                        <Text style={styles.buttonText}>Pay {formatPrice(reservation.priceCents)}</Text>
                    )}
                </Pressable>
                <Pressable style={styles.secondary} onPress={() => navigation.goBack()} disabled={paying}>
                    <Text style={styles.secondaryText}>{isPending ? "Cancel" : "Back"}</Text>
                </Pressable>
            </View>
        </View>
    );
}

function Row({ label, value }) {
    return (
        <View style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
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
    muted: { color: "#6b7280", textAlign: "center" },
    bold: { fontWeight: "700", color: "#111827" },
    error: { color: "#dc2626" },
    successTitle: { fontSize: 22, fontWeight: "700", color: "#111827" },
    footer: {
        padding: 16,
        gap: 8,
        borderTopWidth: 1,
        borderTopColor: "#e5e7eb",
        backgroundColor: "#fff",
    },
    button: { backgroundColor: "#111827", padding: 14, borderRadius: 8, alignItems: "center" },
    fullWidth: { alignSelf: "stretch", marginTop: 8 },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
    secondary: { padding: 12, alignItems: "center" },
    secondaryText: { color: "#111827", fontWeight: "600", fontSize: 16 },
});