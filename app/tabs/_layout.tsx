import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import "../../i18n";

export default function ElderlyTabs() {
  const { t, i18n } = useTranslation();

  return (
    <Tabs
      key={i18n.language}
      initialRouteName="HomePage"
      screenOptions={{ headerShown: false, tabBarLabelStyle: { fontSize: 12 } }}
    >
      <Tabs.Screen
        name="Navigation"
        options={{
          title: t("home.navigation"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="navigate-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Walking"
        options={{
          title: t("home.walkingRoutes"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="walk-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="HomePage"
        options={{
          title: t("home.homeTab"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Community"
        options={{
          title: t("home.ccActivities"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Clinic"
        options={{
          title: t("home.clinics"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="medkit-outline" color={color} size={size} />
          ),
        }}
      />

      {/* Hidden screens */}
      <Tabs.Screen name="Profile" options={{ href: null }} />
      <Tabs.Screen name="Rewards" options={{ href: null }} />
    </Tabs>
  );
}

