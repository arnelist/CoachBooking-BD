import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import TrainerScheduleScreen from "../screens/TrainerScheduleScreen";
import TrainerReservationsScreen from "../screens/TrainerReservationsScreen";
import TrainerProfileScreen from "../screens/TrainerProfileScreen";

const Tab = createBottomTabNavigator();

const ICONS = {
  Schedule: "calendar-outline",
  Reservations: "list-outline",
  Profile: "person-outline",
};

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
            <Tab.Screen name="Reservations" component={TrainerReservationsScreen} />
            <Tab.Screen name="Profile" component={TrainerProfileScreen} />
        </Tab.Navigator>
    );
}