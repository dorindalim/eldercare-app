import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import "../../i18n";
export default function ElderlyTabs() {
  return (
    <Tabs
      initialRouteName="HomePage"
      screenOptions={{ headerShown: false, tabBarLabelStyle: { fontSize: 12 } }}
    >
      {" "}
      <Tabs.Screen
        name="Navigation"
        options={{
          title: "Navigation",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="navigate-outline" color={color} size={size} />
          ),
        }}
      />{" "}
      <Tabs.Screen
        name="Walking"
        options={{
          title: "Walking Routes",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="walk-outline" color={color} size={size} />
          ),
        }}
      />{" "}
      <Tabs.Screen
        name="HomePage"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />{" "}
      <Tabs.Screen
        name="Community"
        options={{
          title: "CC Activities",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" color={color} size={size} />
          ),
        }}
      />{" "}
      <Tabs.Screen
        name="Clinic"
        options={{
          title: "Clinic",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="medkit-outline" color={color} size={size} />
          ),
        }}
      />{" "}
      {/* Hidden screens (still navigable via router.push) */}{" "}
      <Tabs.Screen name="Profile" options={{ href: null }} />{" "}
      <Tabs.Screen name="Rewards" options={{ href: null }} />{" "}
    </Tabs>
  );
}
