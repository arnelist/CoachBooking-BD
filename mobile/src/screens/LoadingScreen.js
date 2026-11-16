import { View, ActivityIndicator, Button, StyleSheet } from "react-native";
import { signOut } from "firebase/auth";
import { auth } from "../services/firebase";
import { useAuth } from "../context/AuthContext";

export default function LoadingScreen() {
  const { user } = useAuth();
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      {user && <Button title="Log out" onPress={() => signOut(auth)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
});