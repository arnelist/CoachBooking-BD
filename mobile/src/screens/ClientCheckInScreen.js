import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert, Linking, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase";
import { checkIn } from "../services/reservations";
import { authErrorMessage } from "../utils/authErrors";

export default function ClientCheckInScreen({ route, navigation }) {
    const { reservationId } = route.params;
    const [permission, requestPermission] = useCameraPermissions();
    const [reservation, setReservation] = useState(undefined); // undefined - loading, null - not found
    const [busy, setBusy] = useState(false);
    //Camera reports the same code many times per second, only the first one counts
    const busyRef = useRef(false);

    useEffect(() => {
        return onSnapshot(
            doc(db, "reservations", reservationId),
            (snap) => setReservation(snap.exists() ? { id: snap.id, ...snap.data() } : null),
            () => setReservation(null)
        );
    }, [reservationId]);

    async function handleScan({ data }) {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        try {
            await checkIn(reservationId, data);
        } catch (e) {
            Alert.alert("Check-in failed", authErrorMessage(e), [
                {
                    text: "Try again",
                    onPress: () => {
                        busyRef.current = false;
                        setBusy(false);
                    },
                },
            ]);
        }
    }

    if (reservation === undefined || !permission) {
        return (
            <View style={styles.center}>
                <ActivityIndicator />
            </View>
        );
    }

    if (reservation?.status === "checkedIn") {
        return (
            <View style={styles.center}>
                <Text style={styles.doneTitle}>You're checked in</Text>
                <Text style={styles.muted}>
                    {reservation.trainerName} · {reservation.startTime}–{reservation.endTime}
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

    if (!permission.granted) {
        return (
            <View style={styles.center}>
                <Text style={styles.muted}>Camera access is needed to scan the trainer's QR code.</Text>
                <Pressable
                    style={[styles.button, styles.fullWidth]}
                    onPress={permission.canAskAgain ? requestPermission : () => Linking.openSettings()}
                >
                    <Text style={styles.buttonText}>
                        {permission.canAskAgain ? "Allow camera" : "Open settings"}
                    </Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.muted}>Point the camera at the trainer's QR code</Text>

            <View style={styles.cameraBox}>
                <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={busy ? undefined : handleScan}
                />
                {busy && (
                    <View style={styles.overlay}>
                        <ActivityIndicator color="#fff" />
                        <Text style={styles.overlayText}>Checking in...</Text>
                    </View>
                )}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Today's reservation</Text>
                <Text style={styles.muted}>
                    {reservation.startTime}–{reservation.endTime} · {reservation.trainerName}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
    container: { flex: 1, padding: 16, gap: 12 },
    muted: { color: "#6b7280", textAlign: "center" },
    cameraBox: {
        width: "100%",
        aspectRatio: 1,
        borderRadius: 10,
        overflow: "hidden",
        backgroundColor: "#000",
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.5)",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
    },
    overlayText: { color: "#fff", fontWeight: "600" },
    card: {
        backgroundColor: "#fff",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        padding: 16,
        gap: 4,
    },
    cardTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
    doneTitle: { fontSize: 22, fontWeight: "700", color: "#111827" },
    button: { backgroundColor: "#111827", padding: 14, borderRadius: 8, alignItems: "center" },
    fullWidth: { alignSelf: "stretch", marginTop: 8 },
    buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});