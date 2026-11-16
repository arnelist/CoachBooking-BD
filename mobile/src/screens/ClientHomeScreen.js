import { View, Text, Button, StyleSheet } from "react-native";
import { signOut } from "firebase/auth";
import { auth } from "../services/firebase";

export default function ClientHomeScreen() {
  return (
    <View style={styles.container}>
      <Text>Client Home</Text>
      <Button title="Log out" onPress={() => signOut(auth)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
});