import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import TrainerScheduleScreen from "../screens/TrainerScheduleScreen";
import TrainerReservationsScreen from "../screens/TrainerReservationsScreen";
import TrainerRescheduleScreen from "../screens/TrainerRescheduleScreen";
import TrainerCancelScreen from "../screens/TrainerCancelScreen";
import TrainerProfileScreen from "../screens/TrainerProfileScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const ICONS = {
    Schedule: "calendar-outline",
    Reservations: "list-outline",
    Profile: "person-outline",
};

//list -> reschedule -> cancel
function ReservationStack() {
    return (
        <Stack.Navigator>
            <Stack.Screen
                name="ReservationsList"
                component={TrainerReservationsScreen}
                options={{ title: "Reservations" }}
            />
            <Stack.Screen
                name="Reschedule"
                component={TrainerRescheduleScreen}
                options={{ title: "Reschedule" }}
            />
            <Stack.Screen
                name="CancelReservation"
                component={TrainerCancelScreen}
                options={{ title: "Cancel reservation" }}
            />
        </Stack.Navigator>
    );
}

export default function TrainerTabs() {
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
            <Tab.Screen name="Schedule" component={TrainerScheduleScreen} />
            <Tab.Screen name="Reservations" component={ReservationStack} options={{ headerShown: false }} />
            <Tab.Screen name="Profile" component={TrainerProfileScreen} />
        </Tab.Navigator>
    );
}