import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthProvider";
import CheckinCard from "../../src/components/CheckinCard";
import TopBar, { LangCode } from "../../src/components/TopBar";
// ✅ Use the account-scoped hook (make sure the filename matches)
import { useCheckins } from "../../src/hooks/useCheckIns";
import { supabase } from "../../src/lib/supabase";

export default function ElderlyHome() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { session, logout } = useAuth();

  // Pass userId so check-ins are per-account (and card turns green correctly)
  const { coins, weekChecks, todayChecked, checkInToday } = useCheckins(
    session?.userId
  );

  const setLang = async (code: string) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  const handleCheckin = async () => {
    const res = await checkInToday();
    if (!res.ok) {
      // Already checked today (or no-user)
      Alert.alert(t("home.checkedIn"), t("home.checkedIn"));
      return;
    }

    // OPTIONAL: also mirror to Supabase for server-side rules/alerts
    try {
      if (session?.userId) {
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        await supabase.rpc("upsert_checkin_and_increment", {
          p_user: session.userId,
          p_day: today,
        });
      }
    } catch (e) {
      // swallow; local UI already updated
      console.warn("check-in cloud sync failed:", (e as any)?.message || e);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={setLang as (c: LangCode) => void}
        title="Home"
        showHeart
        onSpeak={() => Alert.alert("TTS", "Read screen aloud")}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/LogIn");
        }}
      />

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <CheckinCard
          titleKey="home.imActive"
          hintKey="home.tapToCheckIn"
          hintWhenCheckedKey="home.checkedIn"
          checked={todayChecked}
          onPress={handleCheckin}
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
            <Text style={s.rectText}>{t("home.navigation", "Navigation")}</Text>
          </Pressable>

          <Pressable
            style={s.rect}
            onPress={() => router.push("/tabs/Community")}
          >
            <Ionicons name="people-outline" size={28} color="#222" />
            <Text style={s.rectText}>
              {t("home.ccActivities", "CC Activities")}
            </Text>
          </Pressable>
        </View>

        {/* Row 2: Profile + Walking Routes */}
        <View style={s.row}>
          <Pressable
            style={s.rect}
            onPress={() => router.push("/tabs/Profile")}
          >
            <Ionicons name="person-circle-outline" size={28} color="#222" />
            <Text style={s.rectText}>{t("home.profile", "Profile")}</Text>
          </Pressable>

          <Pressable
            style={s.rect}
            onPress={() => router.push("/tabs/Walking")}
          >
            <Ionicons name="walk-outline" size={28} color="#222" />
            <Text style={s.rectText}>
              {t("home.walkingRoutes", "Walking Routes")}
            </Text>
          </Pressable>
        </View>

        {/* SOS Button */}
        <View style={s.sosWrap}>
          <Pressable style={s.sos}>
            <Text style={s.sosText}>SOS</Text>
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
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
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
  sosText: {
    color: "#FFF",
    fontWeight: "900",
    fontSize: 32,
    letterSpacing: 1,
  },
});
