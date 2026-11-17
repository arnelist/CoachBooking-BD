import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import { formatPrice } from "../utils/price";

export default function TrainerProfileScreen() {
    const { trainer } = useAuth();
    const [locationName, setLocationName] = useState("...");

    useEffect(() => {
        getDoc(doc(db, "locations", trainer.locationId))
            .then((snap) => setLocationName(snap.exists() ? snap.data().name : "-"))
            .catch(() => setLocationName("-"));
    }, [trainer.locationId]);

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.name}>
                {trainer.firstName} {trainer.lastName}
            </Text>
            <Text style={styles.muted}>{trainer.email}</Text>

            <View style={styles.card}>
                <Row label="Specialization" value={trainer.specialization} />
                <Row label="Price" value={formatPrice(trainer.priceCents)} />
                <Row label="Location" value={locationName} />
                <Row label="Education" value={trainer.education} />
                {!!trainer.description && <Row label="About" value={trainer.description} />}
            </View>

            <Text style={styles.muted}>To change these details, contact the administrator.</Text>

            <Pressable style={styles.button} onPress={() => signOut(auth)}>
                <Text style={styles.buttonText}>Log out</Text>
            </Pressable>
        </ScrollView>
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
    container: { padding: 16, gap: 12 },
    name: { fontSize: 24, fontWeight: "700" },
    muted: { color: "#6b7280" },
    card: {
        backgroundColor: "#fff",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        padding: 16,
        gap: 14,
    },
    row: { gap: 2 },
    label: { fontSize: 13, color: "#6b7280", fontWeight: "600" },
    value: { fontSize: 16, color: "#111827" },
    button: {
        marginTop: 8,
        padding: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#111827",
        alignItems: "center",
    },
    buttonText: { color: "#111827", fontWeight: "600", fontSize: 16 },
});