import { View, Text, Pressable, StyleSheet } from "react-native";
import { signOut } from "firebase/auth";
import { auth } from "../services/firebase";
import { useAuth } from "../context/AuthContext";

export default function TrainerStatusScreen() {
  const { trainer } = useAuth();

  let title;
  let message;
  if (trainer.status === "pending") {
    title = "Registration submitted";
    message =
      "An administrator will review your details. Once your registration is approved, this screen will update automatically.";
  } else if (trainer.status === "rejected") {
    title = "Registration rejected";
    message = trainer.rejectionReason
      ? `Reason: ${trainer.rejectionReason}`
      : "No reason was provided.";
  } else {
    // status "approved", bet active === false
    title = "Account deactivated";
    message = "Please contact the administrator for more information.";
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Pressable style={styles.button} onPress={() => signOut(auth)}>
        <Text style={styles.buttonText}>Log Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  message: { fontSize: 16, textAlign: "center", color: "#4b5563" },
  button: { backgroundColor: "#111827", padding: 14, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});