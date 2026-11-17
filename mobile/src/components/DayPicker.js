import { View, Text, Pressable, StyleSheet } from "react-native";

export default function DayPicker({ days, value, onChange }) {
    return (
        <View style={styles.days}>
            {days.map((d) => {
                const active = d.key === value;
                return (
                    <Pressable
                        key={d.key}
                        onPress={() => onChange(d.key)}
                        style={[styles.day, active && styles.dayActive]}
                    >
                        <Text style={[styles.dayWeek, active && styles.textOnDark]}>{d.weekday}</Text>
                        <Text style={[styles.dayNumber, active && styles.textOnDark]}>{d.day}</Text>
                        <Text style={[styles.dayMonth, active && styles.textOnDark]}>{d.month}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    days: { flexDirection: "row", gap: 6 },
    day: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        backgroundColor: "#fff",
    },
    dayActive: { backgroundColor: "#111827", borderColor: "#111827" },
    dayWeek: { fontSize: 12, color: "#6b7280" },
    dayNumber: { fontSize: 18, fontWeight: "700", color: "#111827" },
    dayMonth: { fontSize: 11, color: "#6b7280" },
    textOnDark: { color: "#fff" },
});