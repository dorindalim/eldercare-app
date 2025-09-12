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
          title: "Navi",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="navigate-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Health"
        options={{
          title: "Health",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="heart-outline" color={color} size={size} />
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
          title: "Community",
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
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
