import { View, Text, StyleSheet } from "react-native";

const STATUS = {
    confirmed: { label: "Confirmed", bg: "#dbeafe", color: "#1e40af" },
    checkedIn: { label: "Checked in", bg: "#dcfce7", color: "#166534" },
    noShow: { label: "No-show", bg: "#fee2e2", color: "#991b1b" },
    cancelled: { label: "Cancelled", bg: "#f3f4f6", color: "#6b7280" },
};

const PAYMENT = {
    paid: { label: "Paid", bg: "#dcfce7", color: "#166534" },
    refunded: { label: "Refunded", bg: "#ede9fe", color: "#5b21b6" },
};

const REFUND_PENDING = { label: "Refund pending", bg: "#fef3c7", color: "#92400e" };
const RESCHEDULED = { label: "Rescheduled", bg: "#fef3c7", color: "#92400e" };

function Badge({ label, bg, color }) {
    return (
        <View style={[styles.badge, { backgroundColor: bg }]}>
            <Text style={[styles.text, { color }]}>{label}</Text>
        </View>
    );
}

export default function ReservationBadges({ reservation }) {
    const status = STATUS[reservation.status];
    const payment = 
        reservation.status === "cancelled" && reservation.paymentStatus === "paid"
            ? REFUND_PENDING
            : PAYMENT[reservation.paymentStatus];

    return (
        <View style={styles.row}>
            {!!status && <Badge {...status} />}
            {!!payment && <Badge {...payment} />}
            {!!reservation.rescheduled && <Badge {...RESCHEDULED} />}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
    text: { fontSize: 12, fontWeight: "600" },
});