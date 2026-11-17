import { View, Text, StyleSheet } from "react-native";

export default function TrainerReservationsScreen() {
    return (
        <View style={styles.container}>
        <Text style={styles.muted}>Your reservations will appear here.</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    muted: { color: "#6b7280" },
});