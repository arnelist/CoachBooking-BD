import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, ScrollView } from 'react-native';
import { createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { authErrorMessage } from '../utils/authErrors';
import { formatName } from '../utils/format';

export default function RegisterScreen({ navigation }) {

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [password2, setPassword2] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleRegister() {
        setError('');
        if (!firstName.trim() || !lastName.trim() || !email.trim()) {
            setError('Please fill in all fields');
            return;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters long');
            return;
        }
        if (password !== password2) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);
        let cred = null;
        try {
            cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
            await setDoc(doc(db, 'users', cred.user.uid), {
                firstName: formatName(firstName),
                lastName: formatName(lastName),
                email: cred.user.email,
                role: 'client',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        } catch (e) {
            //if acc created but failed to write to db, delete the account to avoid role-less acc
            if (cred) await deleteUser(cred.user).catch(() => {});
            setError(authErrorMessage(e));
        } finally {
            setLoading(false);
        }
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>Client Registration</Text>

            <TextInput
                style={styles.input}
                placeholder="First Name..."
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                autoComplete="given-name"
            />
            <TextInput
                style={styles.input}
                placeholder="Last Name..."
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                autoComplete="family-name"
            />
            <TextInput
                style={styles.input}
                placeholder="example@email.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
            />
            <TextInput
                style={styles.input}
                placeholder="Password..."
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
            />
            <TextInput
                style={styles.input}
                placeholder="Confirm Password..."
                value={password2}
                onChangeText={setPassword2}
                secureTextEntry
                autoComplete="new-password"
            />

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Pressable style={styles.button} onPress={handleRegister} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign Up</Text>}
            </Pressable>

            <Pressable onPress={() => navigation.popTo('Login')}>
                <Text style={styles.link}>Already have an account? Log In</Text>
            </Pressable>
            
            <Pressable onPress={() => navigation.navigate('TrainerRegister')}>
                <Text style={styles.link}>Are you a trainer? Register here</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 26, fontWeight: "700", textAlign: "center" },

  progress: { gap: 8, marginBottom: 8 },
  bars: { flexDirection: "row", gap: 6 },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "#e5e7eb" },
  barActive: { backgroundColor: "#111827" },

  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  label: { fontWeight: "600", marginTop: 4 },
  muted: { color: "#6b7280" },

  option: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, gap: 2 },
  optionSelected: { borderColor: "#111827", backgroundColor: "#111827" },
  optionTitle: { fontSize: 16, fontWeight: "600" },
  textOnDark: { color: "#fff" },

  error: { color: "#dc2626" },

  buttonRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  button: { padding: 14, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#111827" },
  buttonPrimary: { flex: 1, backgroundColor: "#111827" },
  buttonSecondary: { borderWidth: 1, borderColor: "#111827", paddingHorizontal: 20 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  buttonSecondaryText: { color: "#111827", fontWeight: "600", fontSize: 16 },

  link: { textAlign: "center", color: "#2563eb", marginTop: 8 },
});