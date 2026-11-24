import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet } from "react-native";
import { doc, onSnapshot } from "firebase/firestore";
import QRCode from "react-native-qrcode-svg";
import { db } from "../services/firebase";
import { getCheckInCode, markAttendance } from "../services/reservations";
import { authErrorMessage } from "../utils/authErrors";

export default function TrainerCheckInScreen({ route, navigation }) {
    const { reservationId } = route.params;
    const [reservation, setReservation] = useState(undefined); // undefined - loading, null - not found
    const [code, setCode] = useState(null);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    //Real-time: screen changes right after QR scan
    useEffect(() => {
        return onSnapshot(
            doc(db, "reservations", reservationId),
            (snap) => setReservation(snap.exists() ? { id: snap.id, ...snap.data() } : null),
            () => setReservation(null)
        );
    }, [reservationId]);

    //Only server can create valid code
    useEffect(() => {
        getCheckInCode(reservationId)
            .then(setCode)
            .catch((e) => setError(authErrorMessage(e)));
    }, [reservationId]);

    async function mark(attended) {
        setSaving(true);
        try {
            await markAttendance(reservationId, attended);
        } catch (e) {
            Alert.alert("Could not save attendance", authErrorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    function confirmNoShow() {
        Alert.alert("Mark as no-show?", `${reservation.clientName} did not come to the training.`, [
            { text: "Back", style: "cancel" },
            { text: "No-show", style: "destructive", onPress: () => mark(false) },
        ]);
    }

    if (reservation === undefined) {
        return (
            <View style={styles.center}>
                <ActivityIndicator />
            </View>
        );
    }

    if (reservation?.status === "checkedIn" || reservation?.status === "noShow") {
        const attended = reservation.status === "checkedIn";
        return (
            <View style={styles.center}>
                <Text style={styles.doneTitle}>{attended ? "Checked in" : "Marked as no-show"}</Text>
                <Text style={styles.muted}>
                    {reservation.clientName} · {reservation.startTime}–{reservation.endTime}
                </Text>
                <Pressable style={[styles.button, styles.fullWidth]} onPress={() => navigation.goBack()}>
                    <Text style={styles.buttonText}>Done</Text>
                </Pressable>
            </View>
        );
    }

    if (reservation === null || reservation.status !== "confirmed") {
        return (
            <View style={styles.center}>
                <Text style={styles.muted}>This reservation can't be checked in.</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.name}>{reservation.clientName}</Text>
            <Text style={styles.muted}>
                {reservation.date}, {reservation.startTime}–{reservation.endTime}
            </Text>

            <View style={styles.qrBox}>
                {code ? (
                    <QRCode value={code} size={220} />
                ) : error ? (
                    <Text style={styles.error}>{error}</Text>
                ) : (
                    <ActivityIndicator />
                )}
            </View>
            <Text style={styles.muted}>Ask the client to scan this code in the app</Text>

            <Text style={[styles.muted, styles.cantScan]}>Can't scan?</Text>
            <View style={styles.actions}>
                <Pressable style={[styles.outline, saving && styles.disabled]} onPress={() => mark(true)} disabled={saving}>
                    <Text style={styles.outlineText}>Attended</Text>
                </Pressable>
                <Pressable style={[styles.outline, saving && styles.disabled]} onPress={confirmNoShow} disabled={saving}>
                    <Text style={styles.outlineText}>No-show</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
    container: { flex: 1, alignItems: "center", padding: 24, gap: 8 },
    name: { fontSize: 20, fontWeight: "700", color: "#111827" },
    muted: { color: "#6b7280", textAlign: "center" },
    error: { color: "#dc2626", textAlign: "center" },
    qrBox: {
        width: 260,
        height: 260,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        marginVertical: 12,
        padding: 12,
    },
    cantScan: { marginTop: 16 },
    actions: { flexDirection: "row", gap: 8, alignSelf: "stretch" },
    outline: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#111827",
        borderRadius: 8,
        padding: 14,
        alignItems: "center",
        backgroundColor: "#fff",
    },
    outlineText: { fontWeight: "600", fontSize: 16, color: "#111827" },
    disabled: { opacity: 0.4 },
    doneTitle: { fontSize: 22, fontWeight: "700", color: "#111827" },
    button: { backgroundColor: "#111827", padding: 14, borderRadius: 8, alignItems: "center" },
    fullWidth: { alignSelf: "stretch", marginTop: 8 },
    buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});