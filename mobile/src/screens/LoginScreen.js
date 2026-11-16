import { View, Text, Button, StyleSheet } from 'react-native';

export default function LoginScreen({ navigation }) {
    return (
        <View style={styles.container}>
            <Text>Login</Text>
            <Button title="Register as Client" onPress={() => navigation.navigate('Register')} />
            <Button title="Register as Trainer" onPress={() => navigation.navigate('TrainerRegister')} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12
    },
});