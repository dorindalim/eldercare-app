import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import "../../i18n";

const LILAC  = "#CFADE8";
const SUN    = "#FED787";
const STROKE = "#1F1930";

function IconChip({
  name,
  focused,
  iconSize = 24,
  box = 44,
}: {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  iconSize?: number;
  box?: number;
}) {
  return (
    <View
      style={{
        width: box,
        height: box,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: STROKE,
        backgroundColor: focused ? SUN : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={name} size={iconSize} color={STROKE} />
    </View>
  );
}

export default function ElderlyTabs() {
  const { t, i18n } = useTranslation();

  return (
    <Tabs
      key={i18n.language}
      initialRouteName="HomePage"
      screenOptions={{
        sceneStyle: { paddingBottom: 90 },
        headerShown: false,
        tabBarStyle: {
          backgroundColor: LILAC,
          height: 90,            
          paddingTop: 8,
          paddingBottom: 14,       
          borderTopWidth: 0,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          position: "absolute",
          left: 0, right: 0, bottom: 0,
          overflow: "hidden",
        },
        tabBarItemStyle: {
          paddingTop: 6,           
        },
        tabBarLabelStyle: {
          fontSize: 12,
          marginTop: 10,
          color: STROKE,
          fontWeight: "600",
        },
        tabBarActiveTintColor: STROKE,
        tabBarInactiveTintColor: STROKE,
        tabBarHideOnKeyboard: false,
      }}
    >
      <Tabs.Screen
        name="Navigation"
        options={{
          title: t("home.navigation"),
          tabBarIcon: ({ focused }) => (
            <IconChip name="navigate-outline" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="Activities"
        options={{
          title: t("home.allActivities"),
          tabBarIcon: ({ focused }) => (
            <IconChip name="calendar-outline" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="HomePage"
        options={{
          title: t("home.homeTab"),
          tabBarIcon: ({ focused }) => (
            <IconChip name="home-outline" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="Clinic"
        options={{
          title: t("home.clinics"),
          tabBarIcon: ({ focused }) => (
            <IconChip name="medkit-outline" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="Bulletin"
        options={{
          title: t("home.bulletinBoard"),
          tabBarIcon: ({ focused }) => (
            <IconChip name="newspaper-outline" focused={focused} />
          ),
        }}
      />

      {/* hidden tabs */}
      <Tabs.Screen name="Walking" options={{ href: null }} />
      <Tabs.Screen name="Community" options={{ href: null }} />
      <Tabs.Screen name="Profile" options={{ href: null }} />
      <Tabs.Screen name="Rewards" options={{ href: null }} />
      <Tabs.Screen name="ActivityChat" options={{ href: null }} />
    </Tabs>
  );
}
