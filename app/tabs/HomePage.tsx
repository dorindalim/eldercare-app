import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import CheckinCard from "../../src/components/CheckinCard";
import TopBar, { LangCode } from "../../src/components/TopBar";
import { useCheckins } from "../../src/hooks/useCheckIns";

export default function ElderlyHome() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { session, logout } = useAuth();

  const { coins, weekChecks, todayChecked, checkInToday, refresh } = useCheckins(
    session?.userId
  );

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const setLang = async (code: string) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  const handleCheckin = async () => {
    const res = await checkInToday();
    if (!res.ok) {
      Alert.alert(t("home.checkedIn"), t("home.checkedIn"));
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={["left", "right"]}>
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={setLang as (c: LangCode) => void}
        includeTopInset={true}
        barHeight={44}
        topPadding={2}
        title={t("home.homeTab")}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/LogIn");
        }}
      />

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#111827" colors={["#111827"]} />
        }
      >
        <CheckinCard
          titleKey="home.imActive"
          hintKey="home.tapToCheckIn"
          hintWhenCheckedKey="home.checkedIn"
          checked={todayChecked}
          onPress={checkInToday}
          weekChecks={weekChecks}
          coins={coins}
          onPressRewards={() => router.push("/tabs/Rewards")}
        />

        {/* Row 1: Navigation + CC Activities */}
        <View style={s.row}>
          <Pressable
            style={s.rect}
            onPress={() => router.push("/tabs/Navigation")}
          >
            <Ionicons name="navigate-outline" size={28} color="#222" />
            <AppText variant="title" weight="700" style={s.rectText}>
              {t("home.navigation")}
            </AppText>
          </Pressable>

          <Pressable
            style={s.rect}
            onPress={() => router.push("/tabs/Community")}
          >
            <Ionicons name="people-outline" size={28} color="#222" />
            <AppText variant="title" weight="700" style={s.rectText}>
              {t("home.ccActivities")}
            </AppText>
          </Pressable>
        </View>

        {/* Row 2: Profile + Walking Routes */}
        <View style={s.row}>
          <Pressable style={s.rect} onPress={() => router.push("/tabs/Clinic")}>
            <Ionicons name="medkit-outline" size={28} color="#222" />
            <AppText variant="title" weight="700" style={s.rectText}>
              {t("home.clinics")}
            </AppText>
          </Pressable>

          <Pressable
            style={s.rect}
            onPress={() => router.push("/tabs/Walking")}
          >
            <Ionicons name="walk-outline" size={28} color="#222" />
            <AppText variant="title" weight="700" style={s.rectText}>
              {t("home.walkingRoutes")}
            </AppText>
          </Pressable>
        </View>

        {/* SOS Button */}
        <View style={s.sosWrap}>
          <Pressable style={s.sos}>
            <AppText variant="h1" weight="900" color="#FFF">
              {t("home.sos")}
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingBottom: 24,
    paddingTop: 6,
  },

  row: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  rect: {
    flex: 1,
    marginHorizontal: 4,
    height: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  rectText: {
    marginTop: 8,
    textAlign: "center",
  },

  sosWrap: { alignItems: "center", marginTop: 20, marginBottom: 12 },
  sos: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#E53935",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
});
