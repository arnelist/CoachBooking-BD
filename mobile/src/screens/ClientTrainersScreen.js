import { useEffect, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from "react-native";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../services/firebase";
import ListItem from "../components/ListItem";
import { formatPrice } from "../utils/price";
import { authErrorMessage } from "../utils/authErrors";

export default function ClientTrainersScreen({ route, navigation }) {
    const { locationId, locationName } = route.params;
    const [trainers, setTrainers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    //Only approved and active
    useEffect(() => {
        const q = query(
            collection(db, "trainers"),
            where("locationId", "==", locationId),
            where("status", "==", "approved"),
            where("active", "==", true)
        );
        return onSnapshot(
            q,
            (snap) => {
                const list = snap.docs 
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => a.lastName.localeCompare(b.lastName, "lt"));
                setTrainers(list);
                setLoading(false);
            },
            (e) => {
                setError(authErrorMessage(e));
                setLoading(false);
            }
        );
    }, [locationId]);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator />
            </View>
        );
    }

    return (
        <FlatList
            data={trainers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
                <Text style={styles.muted}>{error || "No trainers at this location yet."}</Text>
            }
            renderItem={({ item }) => {
                const name = `${item.firstName} ${item.lastName}`;
                return (
                    <ListItem
                        title={name}
                        subtitle={item.specialization}
                        meta={formatPrice(item.priceCents)}
                        onPress={() => navigation.navigate("Trainer", { trainerId: item.id, name, locationName })}
                    />
                );
            }}
        />
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    list: { padding: 16, gap: 10 },
    muted: { color: "#6b7280", textAlign: "center", marginTop: 24 },
});