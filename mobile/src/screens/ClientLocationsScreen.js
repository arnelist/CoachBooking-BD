import { useEffect, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from "react-native";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../services/firebase";
import ListItem from "../components/ListItem";
import { authErrorMessage } from "../utils/authErrors";

export default function ClientLocationsScreen({ navigation }) {
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const q = query(collection(db, "locations"), where("active", "==", true));
        return onSnapshot(
            q,
            (snap) => {
                const list = snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => a.order - b.order);
                setLocations(list);
                setLoading(false);
            },
            (e) => {
                setError(authErrorMessage(e));
                setLoading(false);
            }
        );
    }, []);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator />
            </View>
        );
    }

    return (
        <FlatList
            data={locations}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={<Text style={styles.hint}>Choose where you'd like to train</Text>}
            ListEmptyComponent={
                <Text style={styles.muted}>{error || "No locations available right now."}</Text>
            }
            renderItem={({ item }) => (
                <ListItem
                    title={item.name}
                    subtitle={item.address}
                    onPress={() => 
                        navigation.navigate("Trainers", {locationId: item.id, locationName: item.name })
                    }
                />
            )}
        />
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    list: { padding: 16, gap: 10 },
    hint: { color: "#6b7280", marginBottom: 4 },
    muted: { color: "#6b7280", textAlign: "center", marginTop: 24 },
});