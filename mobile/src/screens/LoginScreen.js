import { useState } from 'react';
import { Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';
import { authErrorMessage } from '../utils/authErrors';

export default function LoginScreen({ navigation }) {

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleLogin() {
        setError('');
        if (!email.trim() || !password) {
            setError('Please fill in all fields');
            return;
        }

        setLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email.trim(), password);
        } catch (e) {
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
            <Text style={styles.title}>CoachBooking</Text>

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
                autoComplete="password"
            />

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log In</Text>}
            </Pressable>

            <Pressable onPress={() => navigation.navigate('Register')}>
                <Text style={styles.link}>Don't have an account? Sign Up</Text>
            </Pressable>
            
            <Pressable onPress={() => navigation.navigate('TrainerRegister')}>
                <Text style={styles.link}>Are you a trainer? Register here</Text>
            </Pressable>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container:
    { 
        flex: 1, 
        justifyContent: "center", 
        padding: 24, 
        gap: 12 
    },
    title: 
    { 
        fontSize: 28, 
        fontWeight: "700", 
        textAlign: "center", 
        marginBottom: 16 
    },
    input: 
    { 
        borderWidth: 1, 
        borderColor: "#ccc", 
        borderRadius: 8, 
        padding: 12, 
        fontSize: 16 
    },
    error: { color: "#dc2626" },
    button: 
    { 
        backgroundColor: "#111827", 
        padding: 14, 
        borderRadius: 8, 
        alignItems: "center" 
    },
    buttonText: 
    { 
        color: "#fff", 
        fontWeight: "600", 
        fontSize: 16 
    },
    link: 
    { 
        textAlign: "center", 
        color: "#2563eb", 
        marginTop: 8 
    },
});