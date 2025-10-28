import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import TopBar, { type LangCode } from "../../src/components/TopBar";

const BG = "#FFFAF0";
const EXTRA_BOTTOM = -40; 

export default function ActivitiesScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { logout } = useAuth();

  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const bottomLift = Math.max(0, tabBarHeight + insets.bottom + EXTRA_BOTTOM);

  const setLanguage = async (code: LangCode) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  return (
    <SafeAreaView style={s.safe} edges={["left", "right", "bottom"]}>
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={setLanguage}
        titleKey="home.allActivities"
        includeTopInset
        barHeight={44}
        topPadding={2}
        bgColor="#FFD3CD"
        textColor="#111827"
        borderColor="#E5E7EB"
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/Welcome");
        }}
      />

      <View style={[s.wrapper, { paddingBottom: bottomLift }]}>
        <View style={s.card}>
          <AppText variant="title" weight="900" style={s.question}>
            {t("activities.prompt")}
          </AppText>

          <Pressable
            style={s.btn}
            onPress={() => router.push("/tabs/Walking")}
            accessibilityRole="button"
            accessibilityLabel={t("activities.parks")}
          >
            <Ionicons name="walk-outline" size={20} color="#FFFFFF" style={s.btnIcon} />
            <AppText variant="button" color="#FFFFFF" style={s.btnText}>
              {t("activities.parks")}
            </AppText>
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </Pressable>

          <Pressable
            style={s.btn}
            onPress={() => router.push("/tabs/Community")}
            accessibilityRole="button"
            accessibilityLabel={t("activities.ccActivities")}
          >
            <Ionicons name="people-outline" size={20} color="#FFFFFF" style={s.btnIcon} />
            <AppText variant="button" color="#FFFFFF" style={s.btnText}>
              {t("activities.ccActivities")}
            </AppText>
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  wrapper: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },

  card: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    alignItems: "stretch",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },

  question: { textAlign: "center", marginBottom: 16 },

  btn: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },

  btnIcon: { marginRight: 8 },
  btnText: { flex: 1, marginLeft: 8 },
});
