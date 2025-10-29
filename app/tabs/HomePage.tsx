import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import * as SMS from "expo-sms";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Animated,
  AppState,
  Easing,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import CheckinCard from "../../src/components/CheckinCard";
import TopBar, { LangCode } from "../../src/components/TopBar";
import { useCheckins } from "../../src/hooks/useCheckIns";
import { supabase } from "../../src/lib/supabase";

const BG = "#FFFAF0";
const STROKE = "#1F1930";
const LILAC = "#CFADE8";
const GREEN = "#BFE8C6";
const ORANGE = "#FED787";
const BLUE = "#CFE7FF";

const CHECKIN_OFFSET_STROKE = "#1F1930";

function normalizeSGToE164(local: string | null | undefined) {
  const d = String(local ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("65") && d.length >= 10) return `+${d.slice(0, 10)}`;
  if (d.length >= 8) return `+65${d.slice(-8)}`;
  return null;
}

function OffsetWrap({
  children,
  radius = 18,
  dx = 8,
  dy = 8,
  stroke = CHECKIN_OFFSET_STROKE,
  fill,
}: {
  children: React.ReactNode;
  radius?: number;
  dx?: number;
  dy?: number;
  stroke?: string;
  fill?: string;
}) {
  return (
    <View style={{ width: "100%", maxWidth: 520, alignSelf: "center", marginBottom: 16 }}>
      <View style={{ position: "relative" }}>
        <View
          style={{
            position: "absolute",
            left: dx,
            top: dy,
            right: -dx,
            bottom: -dy,
            borderRadius: radius,
            borderWidth: 2,
            borderColor: stroke,
            backgroundColor: "#FFF",
            opacity: 0.95,
          }}
        />
        <View style={{ borderRadius: radius, overflow: "hidden" }}>{children}</View>
      </View>
    </View>
  );
}

function HomePill({
  label,
  color,
  icon,
  onPress,
  width = 140,
  height = 56,
  radius = 12,
  offset = 6,
}: {
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  width?: number;
  height?: number;
  radius?: number;
  offset?: number;
}) {
  return (
    <Pressable onPress={onPress} style={{ marginRight: 12 }}>
      {({ pressed }) => (
        <View style={{ width, height, position: "relative" }}>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: offset,
              top: offset,
              right: -offset,
              bottom: -offset,
              borderRadius: radius,
              backgroundColor: color,
              borderWidth: 2,
              borderColor: STROKE,
            }}
          />
          <View
            style={{
              flex: 1,
              borderRadius: radius,
              backgroundColor: "#FFFFFF",
              borderWidth: 2,
              borderColor: pressed ? "#000" : STROKE,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 14,
              transform: pressed ? [{ translateX: -1 }, { translateY: -1 }] : [],
            }}
          >
            <Ionicons name={icon} size={20} color={STROKE} style={{ marginRight: 8 }} />
            <AppText weight="800" style={{ fontSize: 16 }}>
              {label}
            </AppText>
          </View>
        </View>
      )}
    </Pressable>
  );
}

export default function ElderlyHome() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { session, logout } = useAuth();

  const { coins, weekChecks, todayChecked, checkInToday, refresh } = useCheckins(
    session?.userId
  );

  const [refreshing, setRefreshing] = useState(false);
  const [elderName, setElderName] = useState<string | null>(null);

  const [sosVisible, setSosVisible] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const ecRef = useRef<{ name: string | null; phoneIntl: string | null }>({
    name: null,
    phoneIntl: null,
  });

  const awaitingReturnRef = useRef(false);
  const pendingCallRef = useRef<string | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && awaitingReturnRef.current && pendingCallRef.current) {
        callNumber(pendingCallRef.current);
        awaitingReturnRef.current = false;
        pendingCallRef.current = null;
      }
    });
    return () => sub.remove();
  }, []);

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

  const fetchEmergencyContact = async () => {
    if (!session?.userId) {
      return {
        ecName: null as string | null,
        ecPhoneIntl: null as string | null,
        elderName: null as string | null,
      };
    }
    const { data, error } = await supabase
      .from("elderly_profiles")
      .select("emergency_name, emergency_phone, name")
      .eq("user_id", session.userId)
      .maybeSingle();

    if (error) return { ecName: null, ecPhoneIntl: null, elderName: null };
    const ecPhoneIntl = normalizeSGToE164(data?.emergency_phone);
    return {
      ecName: data?.emergency_name ?? null,
      ecPhoneIntl,
      elderName: data?.name ?? null,
    };
  };

  useEffect(() => {
    (async () => {
      const f = await fetchEmergencyContact();
      setElderName(f.elderName ?? null);
    })();
  }, []);

  const getLiveLocationUrl = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return null;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = pos.coords;
      return `https://maps.google.com/?q=${latitude},${longitude}`;
    } catch {
      return null;
    }
  };

  const callNumber = async (phone: string) => {
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {}
  };

  const openSmsComposer = async (to: string, body: string) => {
    try {
      const available = await SMS.isAvailableAsync();
      if (available) {
        await SMS.sendSMSAsync([to], body);
      } else {
        await Linking.openURL(`sms:${to}?body=${encodeURIComponent(body)}`);
      }
    } catch {
      Alert.alert(t("errors.smsTitle"), t("errors.smsBody"));
    }
  };

  const sendSmsThenAutoCall = async (phoneIntl: string, message: string) => {
    awaitingReturnRef.current = true;
    pendingCallRef.current = phoneIntl;

    await openSmsComposer(phoneIntl, message);

    setTimeout(() => {
      if (awaitingReturnRef.current && pendingCallRef.current) {
        callNumber(pendingCallRef.current);
        awaitingReturnRef.current = false;
        pendingCallRef.current = null;
      }
    }, 300);
  };

  const performSOS = async () => {
    let { name, phoneIntl } = ecRef.current;
    if (!phoneIntl) {
      const f = await fetchEmergencyContact();
      name = f.ecName ?? null;
      phoneIntl = f.ecPhoneIntl;
      ecRef.current = { name, phoneIntl };
    }
    if (!phoneIntl) {
      Alert.alert(t("alerts.noEC.title"), t("alerts.noEC.body"));
      return;
    }

    const mapsUrl = await getLiveLocationUrl();
    const elderNameFetched =
      (await supabase
        .from("elderly_profiles")
        .select("name")
        .eq("user_id", session?.userId ?? "")
        .maybeSingle()).data?.name ?? "Your loved one";

    const timeStr = new Date().toLocaleString(i18n.language || "en-SG", { hour12: false });
    const message =
      `${elderNameFetched} has sent an SOS.\n` +
      (mapsUrl ? `Live location: ${mapsUrl}\n` : "") +
      `Time: ${timeStr}`;

    await sendSmsThenAutoCall(phoneIntl, message);
  };

  const startSOS = async () => {
    const { ecName, ecPhoneIntl } = await fetchEmergencyContact();
    ecRef.current = { name: ecName ?? null, phoneIntl: ecPhoneIntl };

    setSosVisible(true);
    setCountdown(5);

    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 5000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          setSosVisible(false);
          performSOS();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const cancelSOS = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSosVisible(false);
    progressAnim.stopAnimation();
    awaitingReturnRef.current = false;
    pendingCallRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      progressAnim.stopAnimation();
    };
  }, []);

  return (
    <SafeAreaView style={s.safe} edges={["left", "right"]}>
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={async (code) => {
          await i18n.changeLanguage(code);
          await AsyncStorage.setItem("lang", code);
        }}
        includeTopInset
        barHeight={44}
        topPadding={2}
        bgColor={BG}
        title={t("home.homeTab")}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/Welcome");
        }}
      />

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#111827"
            colors={["#111827"]}
          />
        }
      >
        <View style={{ width: "100%", maxWidth: 520, alignSelf: "center", marginBottom: 20 }}>
          <AppText variant="h1" weight="800" style={{ marginBottom: 10 }}>
            {t("home.lepakGreeting", { name: elderName ?? t("home.friend", "friend") })}
          </AppText>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pillRow}>
            <HomePill
              label={t("home.navigation")}
              color={LILAC}
              icon="navigate-outline"
              onPress={() => router.push("/tabs/Navigation")}
            />
            <HomePill
              label={t("home.allActivities")}
              color={GREEN}
              icon="calendar-outline"
              onPress={() => router.push("/tabs/Activities")}
            />
            <HomePill
              label={t("home.clinics")}
              color={ORANGE}
              icon="medkit-outline"
              onPress={() => router.push("/tabs/Clinic")}
            />
            <HomePill
              label={t("home.bulletinBoard")}
              color={BLUE}
              icon="newspaper-outline"
              onPress={() => router.push("/tabs/Bulletin")}
            />
          </ScrollView>
        </View>

        <OffsetWrap>
          <CheckinCard
            titleKey="home.imActive"
            titleWhenCheckedKey="home.youreCheckedIn"
            hintKey="home.tapToCheckIn"
            hintWhenCheckedKey="home.checkedIn"
            checked={todayChecked}
            onPress={checkInToday}
            weekChecks={weekChecks}
            coins={coins}
            onPressRewards={() => router.push("/tabs/Rewards")}
          />
        </OffsetWrap>

        <View style={s.sosWrap}>
          <Pressable style={s.sos} onPress={startSOS}>
            <AppText variant="h1" weight="900" color="#FFF">
              {t("home.sos")}
            </AppText>
          </Pressable>
        </View>
      </ScrollView>

      {sosVisible && (
        <View style={s.overlay}>
          <View style={s.modal}>
            <AppText variant="h1" weight="900" style={{ textAlign: "center" }}>
              {t("sos.title")}
            </AppText>
            <AppText variant="body" style={s.subtitle}>
              {t("sos.subtitle")}
            </AppText>

            <View style={s.countdownWrap}>
              <AppText variant="h1" weight="900" style={s.countdownNumber}>
                {countdown}
              </AppText>
              <AppText variant="title" weight="700" style={s.countdownSuffix}>
                s
              </AppText>
            </View>

            <View style={s.progressTrack}>
              <Animated.View
                style={[
                  s.progressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  },
                ]}
              />
            </View>

            <View style={s.btnRowSingle}>
              <Pressable style={s.cancelOnlyBtn} onPress={cancelSOS}>
                <AppText variant="title" weight="800" style={s.cancelOnlyText}>
                  {t("sos.cancel")}
                </AppText>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: { flexGrow: 1, paddingHorizontal: 18, paddingBottom: 24, paddingTop: 6 },

  pillRow: {
    paddingVertical: 6,
    paddingRight: 6,
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

  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modal: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 18,
    backgroundColor: "#fff",
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  subtitle: { marginTop: 6, textAlign: "center", color: "#6B7280" },
  countdownWrap: { flexDirection: "row", alignItems: "flex-end", marginTop: 10 },
  countdownNumber: { fontSize: 64, lineHeight: 64, color: "#111827" },
  countdownSuffix: { marginLeft: 4, color: "#6B7280" },
  progressTrack: {
    width: "100%",
    height: 10,
    backgroundColor: "#E5E7EB",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 12,
  },
  progressFill: { height: "100%", backgroundColor: "#EF4444" },
  btnRowSingle: { marginTop: 14, width: "100%" },
  cancelOnlyBtn: {
    backgroundColor: "#EF4444",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelOnlyText: { color: "#fff" },
});
