import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';

import LoadingScreen from '../screens/LoadingScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import TrainerRegisterScreen from '../screens/TrainerRegisterScreen';
import ClientHomeScreen from '../screens/ClientHomeScreen';
import TrainerStatusScreen from '../screens/TrainerStatusScreen';
import UnsupportedRoleScreen from '../screens/UnsupportedRoleScreen';
import TrainerTabs from './TrainerTabs';

const Stack = createNativeStackNavigator();

//Sets which screen to show based on auth state and role
function getMode({ user, profile, trainer}) {
    if (user === undefined) return "loading";
    if (user === null) return "auth";
    if (!profile) return "loading"; //loading or profile being created
    if (profile.role === "client") return "client";
    if (profile.role === "trainer") {
        if (!trainer) return "loading";
        if (trainer.status === "approved" && trainer.active) return "trainer";
        return "trainerStatus";
    }
    return "unsupported"; //admin
}

export default function RootNavigator() {
    const mode = getMode(useAuth());

    return (
        <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {mode === "loading" && (
                    <Stack.Screen name="Loading" component={LoadingScreen} />
                )}

                {mode === "auth" && (
                    <Stack.Group>
                        <Stack.Screen name="Login" component={LoginScreen} />
                        <Stack.Screen name="Register" component={RegisterScreen} />
                        <Stack.Screen name="TrainerRegister" component={TrainerRegisterScreen} />
                    </Stack.Group>
                )}

                {mode === "client" && (
                    <Stack.Screen name="ClientHome" component={ClientHomeScreen} />
                )}

                {mode === "trainer" && (
                    <Stack.Screen name="TrainerApp" component={TrainerTabs} />
                )}

                {mode === "trainerStatus" && (
                    <Stack.Screen name="TrainerStatus" component={TrainerStatusScreen} />
                )}

                {mode === "unsupported" && (
                    <Stack.Screen name="Unsupported" component={UnsupportedRoleScreen} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}