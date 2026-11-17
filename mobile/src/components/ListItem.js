import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function ListItem({ title, subtitle, meta, onPress }) {
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        >
            <View style={styles.text}>
                <Text style={styles.title}>{title}</Text>
                {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
            {!!meta && <Text style={styles.meta}>{meta}</Text>}
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    item: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: "#fff",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        padding: 16,
    },
    pressed: { opacity: 0.6 },
    text: { flex: 1, gap: 2 },
    title: { fontSize: 16, fontWeight: "600", color: "#111827" },
    subtitle: { color: "#6b7280" },
    meta: { fontWeight: "600", color: "#111827" },
});