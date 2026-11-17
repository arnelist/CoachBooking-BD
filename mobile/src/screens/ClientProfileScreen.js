import { View, Text, Pressable, StyleSheet } from "react-native";
import { signOut } from "firebase/auth";
import { auth } from "../services/firebase";
import { useAuth } from "../context/AuthContext";

export default function ClientProfileScreen() {
    const { profile } = useAuth();

    return (
        <View style={styles.container}>
        <Text style={styles.name}>
            {profile.firstName} {profile.lastName}
        </Text>
        <Text style={styles.muted}>{profile.email}</Text>

        <Pressable style={styles.button} onPress={() => signOut(auth)}>
            <Text style={styles.buttonText}>Log out</Text>
        </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { padding: 16, gap: 8 },
    name: { fontSize: 24, fontWeight: "700" },
    muted: { color: "#6b7280" },
    button: {
        marginTop: 16,
        padding: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#111827",
        alignItems: "center",
    },
    buttonText: { color: "#111827", fontWeight: "600", fontSize: 16 },
});