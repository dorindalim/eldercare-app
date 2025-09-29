import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import "../../i18n";

export default function ElderlyTabs() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarLabelStyle: { fontSize: 12 } }}
    >
      <Tabs.Screen
        name="Navigation"
        options={{
          title: "Navigation",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="navigate-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Walking"
        options={{
          title: "Walking Routes",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="walk-outline" color={color} size={size} />
            // If your Ionicons build lacks "walk-outline", use "footsteps-outline"
          ),
        }}
      />
      <Tabs.Screen
        name="HomePage"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Community"
        options={{
          title: "CC Activities",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
