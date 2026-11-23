import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import ClientLocationsScreen from "../screens/ClientLocationsScreen";
import ClientTrainersScreen from "../screens/ClientTrainersScreen";
import ClientTrainerScreen from "../screens/ClientTrainerScreen";
import ClientReservationsScreen from "../screens/ClientReservationsScreen";
import ClientProfileScreen from "../screens/ClientProfileScreen";
import ClientCheckoutScreen from "../screens/ClientCheckoutScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const ICONS = {
    Book: "search-outline",
    Reservations: "calendar-outline",
    Profile: "person-outline",
};

//location -> trainers -> trainer profile
function BookStack() {
    return (
        <Stack.Navigator>
            <Stack.Screen 
                name="Locations" 
                component={ClientLocationsScreen} 
            />
            <Stack.Screen 
                name="Trainers" 
                component={ClientTrainersScreen} 
                options={({ route }) => ({ title: route.params.locationName })}
            />
            <Stack.Screen
                name="Trainer"
                component={ClientTrainerScreen}
                options={({ route }) => ({ title: route.params.name })}
            />
            <Stack.Screen
                name="Checkout"
                component={ClientCheckoutScreen}
                options={{ title: "Confirm booking" }}
            />
        </Stack.Navigator>
    );
}

export default function ClientTabs() {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarActiveTintColor: "#111827",
                tabBarInactiveTintColor: "#9ca3af",
                tabBarIcon: ({ color, size }) => (
                    <Ionicons name={ICONS[route.name]} size={size} color={color} />
                ),
            })}
        >
            <Tab.Screen 
                name="Book" 
                component={BookStack} 
                options={{ headerShown: false }} 
            />
            <Tab.Screen
                name="Reservations" 
                component={ClientReservationsScreen} 
            />
            <Tab.Screen
                name="Profile" 
                component={ClientProfileScreen} 
            />
        </Tab.Navigator>
    );
}