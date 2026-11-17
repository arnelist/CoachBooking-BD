import { View, Text, StyleSheet } from "react-native";

export default function StepProgress({ steps, current }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={styles.bars}>
        {steps.map((_, i) => (
          <View key={i} style={[styles.bar, i <= current && styles.barActive]} />
        ))}
      </View>
      <Text style={styles.caption}>
        Step {current + 1} of {steps.length}: {steps[current]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: "row", gap: 6 },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "#e5e7eb" },
  barActive: { backgroundColor: "#111827" },
  caption: { marginTop: 8, color: "#6b7280" },
});