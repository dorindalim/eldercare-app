import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import OffsetButton from "../../src/components/OffsetButton";
import TopBar, { type LangCode } from "../../src/components/TopBar";

const BG = "#FFFAF0";
const EXTRA_BOTTOM = -200;
const MAXW = 560;

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
        <AppText variant="title" weight="900" style={s.heading}>
          {t("activities.prompt")}
        </AppText>
        <AppText variant="body" color="#6B7280" style={s.sub}>
          {t("activities.subPrompt")}
        </AppText>

        {/* PARKS */}
        <OffsetButton
          style={s.btnWrap}                 
          onPress={() => router.push("/tabs/Walking")}
          accessibilityLabel={t("activities.parks")}
          height={96}
          radius={16}
          bgColor="#FFFFFF"
          borderColor="#111827"
          borderColorActive="#000"
          offsetLeft={5}
          offsetTop={5}
          offsetRight={-7}
          offsetBottom={-7}
          offsetBgColor="#93E6AA"
          contentStyle={s.btnContent}
        >
          <View style={s.row}>
            <Ionicons name="walk-outline" size={40} color="#111827" style={s.leftIcon} />
            <AppText variant="button" weight="900" style={s.bigLabel} numberOfLines={1}>
              {t("activities.parks")}
            </AppText>
            <Ionicons name="chevron-forward" size={30} color="#111827" />
          </View>
        </OffsetButton>

        {/* COMMUNITY CENTRE ACTIVITIES */}
        <OffsetButton
          style={s.btnWrap}                 
          onPress={() => router.push("/tabs/Community")}
          accessibilityLabel={t("activities.ccActivities")}
          height={96}
          radius={16}
          bgColor="#FFFFFF"
          borderColor="#111827"
          borderColorActive="#000"
          offsetLeft={5}
          offsetTop={5}
          offsetRight={-7}
          offsetBottom={-7}
          offsetBgColor="#FED787"
          contentStyle={s.btnContent}
        >
          <View style={s.row}>
            <Ionicons name="people-outline" size={40} color="#111827" style={s.leftIcon} />
            <AppText variant="button" weight="900" style={s.bigLabel} numberOfLines={2}>
              {t("activities.ccActivities")}
            </AppText>
            <Ionicons name="chevron-forward" size={30} color="#111827" />
          </View>
        </OffsetButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  wrapper: {
    flex: 1,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  heading: { textAlign: "left", width: "100%", maxWidth: MAXW, marginBottom: 2 },
  sub:     { textAlign: "left", width: "100%", maxWidth: MAXW, marginBottom: 8 },

  btnWrap:    { width: "100%", maxWidth: MAXW },       
  btnContent: { width: "100%", paddingHorizontal: 18, paddingVertical: 14 },

  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  leftIcon: { marginRight: 12 },
  bigLabel: { flex: 1, lineHeight: 30, color: "#111827", textAlign: "left", marginRight: 12 },
});
