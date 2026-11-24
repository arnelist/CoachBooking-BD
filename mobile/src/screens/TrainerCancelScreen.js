import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert, StyleSheet } from "react-native";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase";
import { trainerCancelReservation } from "../services/reservations";
import { formatPrice } from "../utils/price";
import { authErrorMessage } from "../utils/authErrors";

export default function TrainerCancelScreen({ route, navigation }) {
    const { reservationId } = route.params;
    const [reservation, setReservation] = useState(undefined); // undefined - loading, null - not found
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        return onSnapshot(
            doc(db, "reservations", reservationId),
            (snap) => setReservation(snap.exists() ? { id: snap.id, ...snap.data() } : null),
            () => setReservation(null)
        );
    }, [reservationId]);

    function confirmCancel() {
        Alert.alert(
            "Cancel reservation?",
            `${reservation.clientName} will be refunded ${formatPrice(reservation.priceCents)} and will see your reason.`,
            [
                { text: "Keep", style: "cancel" },
                { text: "Cancel", style: "destructive", onPress: handleCancel },
            ]
        );
    }

     async function handleCancel() {
        setSaving(true);
        try {
            await trainerCancelReservation(reservationId, reason.trim());
            navigation.goBack();
        } catch (e) {
            Alert.alert("Cancellation failed", authErrorMessage(e));
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
                <Text style={styles.muted}>This reservation can no longer be cancelled.</Text>
            </View>
        );
    }

    const valid = reason.trim().length >= 3;

    return (
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <View style={styles.card}>
                <Text style={styles.title}>
                    {reservation.date}, {reservation.startTime}–{reservation.endTime}
                </Text>
                <Text style={styles.muted}>{reservation.clientName}</Text>
            </View>

            <Text style={styles.label}>Reason</Text>
            <TextInput
                style={styles.input}
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. I'm ill"
                multiline
                maxLength={200}
            />
            <Text style={styles.hint}>The client will see this reason. The payment will be refunded.</Text>

            <Pressable
                style={[styles.button, (!valid || saving) && styles.buttonDisabled]}
                onPress={confirmCancel}
                disabled={!valid || saving}
            >
                {saving ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.buttonText}>Cancel reservation</Text>
                )}
            </Pressable>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    container: { padding: 16, gap: 10 },
    card: {
        backgroundColor: "#fff",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        padding: 16,
        gap: 4,
    },
    title: { fontSize: 16, fontWeight: "700", color: "#111827" },
    muted: { color: "#6b7280" },
    label: { fontWeight: "600", marginTop: 6 },
    input: {
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 8,
        padding: 12,
        minHeight: 90,
        textAlignVertical: "top",
        backgroundColor: "#fff",
        fontSize: 16,
    },
    hint: { fontSize: 13, color: "#6b7280" },
    button: { backgroundColor: "#dc2626", padding: 14, borderRadius: 8, alignItems: "center", marginTop: 6 },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});