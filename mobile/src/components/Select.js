import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// options: [{ value, label, description? }]
export default function Select({
  label,
  placeholder = "Select...",
  options,
  value,
  onChange,
  loading = false,
  emptyText = "No options available",
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  function handleSelect(optionValue) {
    onChange(optionValue);
    setOpen(false);
  }

  return (
    <View style={styles.wrapper}>
      {!!label && <Text style={styles.label}>{label}</Text>}

      <Pressable
        style={[styles.field, open && styles.fieldOpen]}
        onPress={() => setOpen(!open)}
        disabled={loading}
      >
        {loading ? (
          <View style={styles.text}>
            <ActivityIndicator />
          </View>
        ) : (
          <View style={styles.text}>
            <Text style={selected ? styles.value : styles.placeholder} numberOfLines={1}>
              {selected ? selected.label : placeholder}
            </Text>
            {!!selected?.description && (
              <Text style={styles.description} numberOfLines={1}>
                {selected.description}
              </Text>
            )}
          </View>
        )}
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color="#6b7280" />
      </Pressable>

      {open && (
        <View style={styles.list}>
          {options.length === 0 ? (
            <Text style={styles.empty}>{emptyText}</Text>
          ) : (
            options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => handleSelect(option.value)}
                  style={[
                    styles.option,
                    index > 0 && styles.optionBorder,
                    isSelected && styles.optionSelected,
                  ]}
                >
                  <View style={styles.text}>
                    <Text style={[styles.value, isSelected && styles.valueSelected]}>
                      {option.label}
                    </Text>
                    {!!option.description && (
                      <Text style={styles.description}>{option.description}</Text>
                    )}
                  </View>
                  {isSelected && <Ionicons name="checkmark" size={20} color="#111827" />}
                </Pressable>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { fontWeight: "600" },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    minHeight: 50,
  },
  fieldOpen: { borderColor: "#111827" },
  text: { flex: 1, gap: 2 },
  value: { fontSize: 16, color: "#111827" },
  valueSelected: { fontWeight: "600" },
  placeholder: { fontSize: 16, color: "#9ca3af" },
  description: { fontSize: 13, color: "#6b7280" },
  list: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, overflow: "hidden" },
  option: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  optionBorder: { borderTopWidth: 1, borderTopColor: "#eee" },
  optionSelected: { backgroundColor: "#f3f4f6" },
  empty: { padding: 12, color: "#6b7280" },
});