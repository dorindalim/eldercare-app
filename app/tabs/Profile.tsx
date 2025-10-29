import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import OffsetButton from "../../src/components/OffsetButton";
import TopBar, { type LangCode } from "../../src/components/TopBar";
import { useCheckins } from "../../src/hooks/useCheckIns";
import { supabase } from "../../src/lib/supabase";
import { useAppSettings } from "../../src/Providers/SettingsProvider";

type EmergencyContact = {
  name?: string | null;
  relation?: string | null;
  phone?: string | null;
  email?: string | null;
};

type ConditionItem = {
  id: string;
  condition: string | null;
  doctor?: string | null;
  clinic?: string | null;
  appointments?: string | null;
  meds: { name: string; frequency?: string | null }[];
};

const PORTAL_BASE_URL = "https://dorindalim.github.io/eldercare-app/ECPortal.html";
const CAREGIVER_MESSAGE = (url: string) =>
  `Hi! This is my Emergency Contact Portal link:\n\n${url}\n\n` +
  `Please keep it safe. On first open, set a 4+ digit PIN. Use the same PIN next time to unlock. Thank you!`;

const isNil = (v?: string | null) =>
  typeof v === "string" && v.trim().toUpperCase() === "NIL";

export default function ElderlyProfile() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { session, logout } = useAuth();
  const { coins, streak, refresh: refreshCheckins } = useCheckins(session?.userId);
  const { textScale, setTextScale } = useAppSettings();

  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const bottomPad = Math.max(0, tabBarHeight + insets.bottom - 100);

  const [name, setName] = useState<string>("-");
  const [yob, setYob] = useState<string>("-");
  const [emergency, setEmergency] = useState<EmergencyContact | null>(null);
  const [assistiveNeeds, setAssistiveNeeds] = useState<string[]>([]);
  const [drugAllergies, setDrugAllergies] = useState<string>("");
  const [publicNote, setPublicNote] = useState<string>("");
  const [conditions, setConditions] = useState<ConditionItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");
  const [typedConfirm, setTypedConfirm] = useState("");
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [deleteProcessing, setDeleteProcessing] = useState(false);

  const setLang = async (code: LangCode) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  const loadData = useCallback(async () => {
    if (!session?.userId) return;

    const { data: prof } = await supabase
      .from("elderly_profiles")
      .select(
        "name, year_of_birth, gender, emergency_name, emergency_relation, emergency_phone, emergency_email, assistive_needs, drug_allergies, public_note"
      )
      .eq("user_id", session.userId)
      .maybeSingle();

    if (prof) {
      setName(prof.name || "-");
      setYob(prof.year_of_birth ? String(prof.year_of_birth) : "-");
      setEmergency({
        name: prof.emergency_name,
        relation: prof.emergency_relation,
        phone: prof.emergency_phone,
        email: prof.emergency_email,
      });
      setAssistiveNeeds(Array.isArray(prof.assistive_needs) ? prof.assistive_needs : []);
      setDrugAllergies(prof.drug_allergies ?? "");
      setPublicNote(prof.public_note ?? "");
    } else {
      setEmergency(null);
      setAssistiveNeeds([]);
      setDrugAllergies("");
      setPublicNote("");
    }

    const { data: conds, error: condErr } = await supabase
      .from("elderly_conditions")
      .select("id, condition, doctor, clinic, appointments")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: true });

    if (condErr || !conds?.length) {
      setConditions([]);
      return;
    }

    const ids = conds.map((c: any) => c.id);
    const { data: meds } = await supabase
      .from("elderly_medications")
      .select("condition_id, name, frequency")
      .in("condition_id", ids)
      .order("created_at", { ascending: true });

    const medMap = new Map<string, { name: string; frequency?: string | null }[]>();
    (meds ?? []).forEach((m: any) => {
      const arr = medMap.get(m.condition_id) ?? [];
      arr.push({ name: m.name, frequency: m.frequency ?? null });
      medMap.set(m.condition_id, arr);
    });

    const merged: ConditionItem[] = conds.map((c: any) => ({
      id: c.id,
      condition: c.condition,
      doctor: c.doctor,
      clinic: c.clinic,
      appointments: c.appointments,
      meds: medMap.get(c.id) ?? [],
    }));

    setConditions(merged);
  }, [session?.userId]);

  type LocPerm = "granted" | "denied" | "undetermined";
  const [locPerm, setLocPerm] = useState<LocPerm>("undetermined");
  const [locServicesOn, setLocServicesOn] = useState<boolean>(true);

  const refreshLocationAccess = useCallback(async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      setLocPerm((perm.status as LocPerm) ?? "undetermined");
      const services = await Location.hasServicesEnabledAsync();
      setLocServicesOn(services);
    } catch {
      setLocPerm("undetermined");
      setLocServicesOn(true);
    }
  }, []);

  const requestLocationAccess = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocPerm(status as LocPerm);
      if (status !== "granted") {
        Alert.alert(
          t("profile.locationAccess.needAccessTitle"),
          t("profile.locationAccess.needAccessBody"),
          [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("profile.locationAccess.openSettings"), onPress: () => Linking.openSettings?.() },
          ]
        );
      }
    } catch {
      Alert.alert(t("common.error"), t("profile.locationAccess.requestError"));
    }
  }, [t]);

  const [notifAllowed, setNotifAllowed] = useState(false);

  const readNotifPermission = useCallback(async () => {
    const cur = await Notifications.getPermissionsAsync();
    setNotifAllowed(!!cur.granted);
  }, []);

  const ensureNotifPermission = useCallback(async () => {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) {
      setNotifAllowed(true);
      return true;
    }
    const req = await Notifications.requestPermissionsAsync();
    const ok = !!req.granted;
    if (ok && Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    setNotifAllowed(ok);
    return ok;
  }, []);

  const toggleNotifications = async () => {
    if (!notifAllowed) {
      const ok = await ensureNotifPermission();
      if (!ok) {
        Alert.alert(
          t("navigation.reminders.permTitle"),
          t("navigation.reminders.permBody"),
          [{ text: t("common.ok") }]
        );
      }
    } else {
      Alert.alert(
        t("community.notifs.turnOffTitle"),
        t("community.notifs.turnOffBody"),
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("profile.locationAccess.openSettings"), onPress: () => Linking.openSettings?.() },
        ]
      );
    }
  };

  const [photoPerm, setPhotoPerm] = useState<"granted" | "denied" | "undetermined">("undetermined");
  useEffect(() => {
    (async () => {
      const p = await ImagePicker.getMediaLibraryPermissionsAsync();
      setPhotoPerm((p.status as any) ?? "undetermined");
    })();
  }, []);

  async function requestPhotoAccess() {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    setPhotoPerm((p.status as any) ?? "undetermined");
    if (p.status === "denied" && !p.canAskAgain) {
      Alert.alert(
        t("profile.photoAccess.deniedTitle"),
        t("profile.photoAccess.deniedBody"),
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("profile.photoAccess.openSettings"), onPress: () => Linking.openSettings?.() },
        ]
      );
    }
  }

  useEffect(() => {
    loadData();
    refreshCheckins();
    refreshLocationAccess();
    readNotifPermission();
  }, [loadData, refreshCheckins, refreshLocationAccess, readNotifPermission]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      refreshCheckins();
      refreshLocationAccess();
      readNotifPermission();
    }, [loadData, refreshCheckins, refreshLocationAccess, readNotifPermission])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadData(), refreshCheckins(), refreshLocationAccess(), readNotifPermission()]);
    setRefreshing(false);
  }, [loadData, refreshCheckins, refreshLocationAccess, readNotifPermission]);

  useEffect(() => {
    if (!session?.userId) return;
    const handle = () => {
      loadData();
      refreshCheckins();
      refreshLocationAccess();
      readNotifPermission();
    };

    const ch = supabase
      .channel(`ec:${session.userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "elderly_profiles", filter: `user_id=eq.${session.userId}` },
        handle
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "elderly_conditions", filter: `user_id=eq.${session.userId}` },
        handle
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "elderly_medications" }, handle)
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [session?.userId, loadData, refreshCheckins, refreshLocationAccess, readNotifPermission]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        loadData();
        refreshCheckins();
        refreshLocationAccess();
        readNotifPermission();
      }
    });
    return () => sub.remove();
  }, [loadData, refreshCheckins, refreshLocationAccess, readNotifPermission]);

  const prettifyAssistive = (code: string) => {
    if (code.startsWith("other:")) return code.replace(/^other:/, "").trim();
    const MAP: Record<string, string> = {
      walking_cane: t("elderlyConditions.assistive.walking_cane"),
      wheelchair: t("elderlyConditions.assistive.wheelchair"),
      hearing_aid: t("elderlyConditions.assistive.hearing_aid"),
      glasses: t("elderlyConditions.assistive.glasses"),
    };
    if (MAP[code]) return MAP[code];
    return code.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  };

  const assistiveDisplay = useMemo(() => {
    if (!assistiveNeeds?.length) return null;
    return assistiveNeeds.map(prettifyAssistive).join(", ");
  }, [assistiveNeeds, i18n.language]);

  const onShareEcPortal = useCallback(async () => {
    if (!session?.userId) {
      Alert.alert(t("common.notLoggedIn"), t("common.pleaseLoginAgain"));
      return;
    }

    const { data: profileRow } = await supabase
      .from("elderly_profiles")
      .select("scheduled_for, deletion_status")
      .eq("user_id", session.userId)
      .maybeSingle();

    if (profileRow) {
      const { scheduled_for, deletion_status } = profileRow as any;
      const scheduledDate = scheduled_for ? new Date(scheduled_for) : null;
      const now = new Date();
      const pendingDeletion =
        deletion_status === "deletion_scheduled" || (scheduledDate && scheduledDate > now);
      if (pendingDeletion) {
        Alert.alert(
          t("profile.delete.title"),
          t("profile.delete.explain") || "Portal disabled while account pending deletion."
        );
        return;
      }
    }

    const { data: linkRow } = await supabase
      .from("ec_links")
      .select("token")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let token: string | null = linkRow?.token ?? null;

    if (!token) {
      const { data: rpcToken } = await supabase.rpc("ec_issue_link_if_ready_for", {
        p_user: session.userId,
      });
      token = rpcToken ?? null;
    }

    if (!token) {
      Alert.alert("No portal link yet", "Your profile may be incomplete, or a link hasn't been created.");
      return;
    }

    const url = `${PORTAL_BASE_URL}?token=${encodeURIComponent(token)}`;
    await Share.share({ message: CAREGIVER_MESSAGE(url) });
  }, [session?.userId, t]);

  const confirmTypedDeletion = async (typed: string) => {
    if (!session?.userId) {
      Alert.alert(t("auth.notLoggedInTitle"), t("auth.notLoggedInBody"));
      return;
    }

    const expected = "DELETE MY ACCOUNT";
    if (typed.trim().toUpperCase() !== expected) {
      Alert.alert(t("common.error"), t("delete.typeMismatch") || "Please type the exact phrase to confirm.");
      return;
    }

    setDeleteProcessing(true);
    try {
      const now = new Date();
      const scheduled = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      const { error } = await supabase
        .from("elderly_profiles")
        .update({
          scheduled_for: scheduled.toISOString(),
          deletion_reason: deletionReason || null,
          deletion_requested_at: new Date().toISOString(),
          deletion_status: "deletion_scheduled",
        })
        .eq("user_id", session.userId);

      if (error) {
        Alert.alert(t("common.error"), error.message || t("delete.failedSchedule"));
        return;
      }

      Alert.alert(t("delete.scheduledAlertTitle"), t("delete.scheduledBody"));
      setShowDeleteModal(false);
      try {
        await logout();
      } catch {}
      router.replace("/Authentication/Welcome");
    } finally {
      setDeleteProcessing(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["left", "right"]}>
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={setLang}
        bgColor="#FFEBC3"
        includeTopInset
        barHeight={44}
        topPadding={2}
        title={t("profile.title")}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/Welcome");
        }}
      />

      <ScrollView
        contentContainerStyle={[
          s.scroll,
          { flexGrow: 1, paddingBottom: bottomPad },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        overScrollMode="always"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Basic Information */}
        <OffsetButton
          radius={16}
          bgColor="#FFF"
          borderColor="#000"
          borderColorActive="#C9F3D5"
          contentStyle={s.cardContent}
          style={s.cardWrapper}
          disabled={true}
        >
          <AppText variant="h2" weight="800">
            {t("profile.basicInfo")}
          </AppText>

          <View style={s.rowBetween}>
            <AppText variant="label" weight="700" color="#2563EB">
              {t("elderlyOnboarding.namePH")}
            </AppText>
            <AppText variant="label" weight="700">
              {name}
            </AppText>
          </View>

          <View style={s.rowBetween}>
            <AppText variant="label" weight="700" color="#2563EB">
              {t("elderlyOnboarding.yobPH")}
            </AppText>
            <AppText variant="label" weight="700">
              {yob}
            </AppText>
          </View>

          <OffsetButton
            onPress={() => router.push("/EditBasic")}
            radius={10}
            bgColor="#FFF"
            borderColor="#000"
            borderColorActive="#C9F3D5"
            contentStyle={s.linkButtonContent}
          >
            <View style={s.linkRow}>
              <Ionicons name="create-outline" size={18} color="#000" />
              <AppText variant="button" weight="800" color="#000">
                {t("profile.editBasic")}
              </AppText>
            </View>
          </OffsetButton>
        </OffsetButton>

        {/* Emergency Health Card */}
        <OffsetButton
          radius={16}
          bgColor="#FFF"
          borderColor="#000"
          borderColorActive="#C9F3D5"
          contentStyle={s.cardContent}
          style={s.cardWrapper}
          disabled={true}
        >
          <AppText variant="h2" weight="800">
            {t("profile.healthCard")}
          </AppText>

          {!!emergency &&
            (emergency.name || emergency.relation || emergency.phone || emergency.email) && (
              <View style={s.block}>
                <AppText variant="label" weight="700" color="#2563EB">
                  {t("profile.emergencyContacts")}
                </AppText>
                <AppText variant="label" weight="700">
                  {[emergency.name, emergency.relation, emergency.phone, emergency.email]
                    .filter(Boolean)
                    .join(" · ")}
                </AppText>
              </View>
            )}

          <View style={s.block}>
            <AppText variant="label" weight="700" color="#2563EB">
              {t("profile.drugAllergy")}
            </AppText>
            <AppText variant="label" weight="700">
              {drugAllergies?.trim() || "–"}
            </AppText>
          </View>

          <View style={s.block}>
            <AppText variant="label" weight="700" color="#2563EB">
              {t("profile.assistive")}
            </AppText>
            <AppText variant="label" weight="700">
              {assistiveDisplay?.trim() || "–"}
            </AppText>
          </View>

          <View style={s.block}>
            <AppText variant="label" weight="700" color="#2563EB">
              {t("profile.publicNote")}
            </AppText>
            <AppText variant="label" weight="700">
              {publicNote?.trim() || "–"}
            </AppText>
          </View>

          <OffsetButton
            onPress={onShareEcPortal}
            radius={10}
            bgColor="#111827"
            borderColor="#000"
            borderColorActive="#C9F3D5"
            contentStyle={s.buttonContent}
          >
            <AppText variant="button" weight="800" color="#000">
              {t("profile.sharePortal")}
            </AppText>
          </OffsetButton>
        </OffsetButton>

        {/* Conditions */}
        <OffsetButton
          radius={16}
          bgColor="#FFF"
          borderColor="#000"
          borderColorActive="#C9F3D5"
          contentStyle={s.cardContent}
          style={s.cardWrapper}
          disabled={true}
        >
          <AppText variant="h2" weight="800">
            {t("profile.conditions")}
          </AppText>

          {conditions.length === 0 ? (
            <AppText variant="label" weight="700">–</AppText>
          ) : (
            <View style={s.block}>
              {conditions.map((c) => {
                const condName = !c.condition || isNil(c.condition) ? "–" : c.condition;
                const medsClean = (c.meds || [])
                  .filter((m) => m.name && !isNil(m.name))
                  .map((m) => {
                    const freq = m.frequency && !isNil(m.frequency) ? ` — ${m.frequency}` : "";
                    return `${m.name}${freq}`;
                  });
                const medsPart = medsClean.length > 0 ? ` (${medsClean.join("; ")})` : "";
                return (
                  <AppText key={c.id} variant="label" weight="700">
                    • {condName}
                    {medsPart}
                  </AppText>
                );
              })}
            </View>
          )}
        </OffsetButton>

        {/* Activity & Rewards */}
        <OffsetButton
          radius={16}
          bgColor="#FFF"
          borderColor="#000"
          borderColorActive="#C9F3D5"
          contentStyle={s.cardContent}
          style={s.cardWrapper}
          disabled={true}
        >
          <AppText variant="h2" weight="800">
            {t("profile.activity")}
          </AppText>

          <View style={s.rowBetween}>
            <AppText variant="label" weight="700" color="#374151">
              {t("profile.streak")}
            </AppText>
            <AppText variant="label" weight="700">
              {streak}
            </AppText>
          </View>

          <View style={s.rowBetween}>
            <AppText variant="label" weight="700" color="#374151">
              {t("profile.coins")}
            </AppText>
            <AppText variant="label" weight="700">
              {coins}
            </AppText>
          </View>

          <OffsetButton
            onPress={() => router.push("/tabs/Rewards")}
            radius={10}
            bgColor="#111827"
            borderColor="#000"
            borderColorActive="#C9F3D5"
            contentStyle={s.buttonContent}
          >
            <AppText variant="button" weight="800" color="#000">
              {t("rewards.title")}
            </AppText>
          </OffsetButton>
        </OffsetButton>

        {/* Accessibility */}
        <OffsetButton
          radius={16}
          bgColor="#FFF"
          borderColor="#000"
          borderColorActive="#C9F3D5"
          contentStyle={s.cardContent}
          style={s.cardWrapper}
          disabled={true}
        >
          <AppText variant="h2" weight="800">
            {t("profile.accessibility")}
          </AppText>

          <AppText variant="label" weight="700" color="#374151" style={{ marginTop: 2 }}>
            {t("profile.textSize")}
          </AppText>

          <View style={s.chipsRow}>
            {(["md", "lg", "xl"] as const).map((sz) => (
              <OffsetButton
                key={sz}
                onPress={() => setTextScale(sz)}
                radius={20}
                bgColor={textScale === sz ? "#000" : "#FFF"}
                borderColor="#000"
                borderColorActive="#C9F3D5"
                contentStyle={s.chipContent}
              >
                <AppText variant="button" weight="800" color={textScale === sz ? "#000" : "#000"}>
                  {sz.toUpperCase()}
                </AppText>
              </OffsetButton>
            ))}
          </View>

          {/* Notifications toggle */}
          <View style={[s.rowBetween, { marginTop: 14, alignItems: "center" }]}>
            <View style={{ flexShrink: 1, paddingRight: 10 }}>
              <AppText variant="label" weight="700" color="#374151">
                {t("profile.notifications.title")}
              </AppText>
              <AppText variant="caption" color="#6B7280" style={{ marginTop: 2 }}>
                {notifAllowed ? t("profile.notifications.status.allowed") : t("profile.notifications.status.notAllowed")}
              </AppText>
            </View>

            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: notifAllowed }}
              onPress={toggleNotifications}
              style={[s.toggleWrap, notifAllowed ? s.toggleOn : s.toggleOff]}
            >
              <View style={[s.knob, notifAllowed ? s.knobOn : s.knobOff]} />
            </Pressable>
          </View>

          {/* Location access toggle */}
          <View style={[s.rowBetween, { marginTop: 14, alignItems: "center" }]}>
            <View style={{ flexShrink: 1, paddingRight: 10 }}>
              <AppText variant="label" weight="700" color="#374151">
                {t("profile.locationAccess.title")}
              </AppText>
              <AppText variant="caption" color="#6B7280" style={{ marginTop: 2 }}>
                {locServicesOn
                  ? locPerm === "granted"
                    ? t("profile.locationAccess.status.granted")
                    : locPerm === "denied"
                    ? t("profile.locationAccess.status.denied")
                    : t("profile.locationAccess.status.askMe")
                  : t("profile.locationAccess.servicesOff")}
              </AppText>
            </View>

            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: locPerm === "granted" && locServicesOn }}
              onPress={() => {
                if (!locServicesOn) {
                  Alert.alert(
                    t("profile.locationAccess.turnOnServicesTitle"),
                    t("profile.locationAccess.turnOnServicesBody"),
                    [
                      { text: t("common.cancel"), style: "cancel" },
                      { text: t("profile.locationAccess.openSettings"), onPress: () => Linking.openSettings?.() },
                    ]
                  );
                  return;
                }
                if (locPerm === "granted") {
                  Alert.alert(
                    t("profile.locationAccess.allowedTitle"),
                    t("profile.locationAccess.allowedBody"),
                    [
                      { text: t("common.cancel"), style: "cancel" },
                      { text: t("profile.locationAccess.openSettings"), onPress: () => Linking.openSettings?.() },
                    ]
                  );
                } else {
                  requestLocationAccess();
                }
              }}
              style={[s.toggleWrap, locServicesOn && locPerm === "granted" ? s.toggleOn : s.toggleOff]}
            >
              <View style={[s.knob, locServicesOn && locPerm === "granted" ? s.knobOn : s.knobOff]} />
            </Pressable>
          </View>
          
          {/* Photo library access toggle */}
          <View style={[s.rowBetween, { marginTop: 14, alignItems: "center" }]}>
            <View style={{ flexShrink: 1, paddingRight: 10 }}>
              <AppText variant="label" weight="700" color="#374151">
                {t("profile.photoAccess.title")}
              </AppText>
              <AppText variant="caption" color="#6B7280" style={{ marginTop: 2 }}>
                {photoPerm === "granted"
                  ? t("profile.photoAccess.status.granted")
                  : photoPerm === "denied"
                  ? t("profile.photoAccess.status.denied")
                  : t("profile.photoAccess.status.askMe")}
              </AppText>
            </View>

            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: photoPerm === "granted" }}
              onPress={() => {
                if (photoPerm === "granted") {
                  Alert.alert(
                    t("profile.photoAccess.allowedTitle"),
                    t("profile.photoAccess.allowedBody"),
                    [
                      { text: t("common.cancel"), style: "cancel" },
                      { text: t("profile.photoAccess.openSettings"), onPress: () => Linking.openSettings?.() },
                    ]
                  );
                } else {
                  requestPhotoAccess();
                }
              }}
              style={[s.toggleWrap, photoPerm === "granted" ? s.toggleOn : s.toggleOff]}
            >
              <View style={[s.knob, photoPerm === "granted" ? s.knobOn : s.knobOff]} />
            </Pressable>
          </View>
        </OffsetButton>

        {/* Delete Account */}
        <OffsetButton
          radius={16}
          bgColor="#FFF"
          borderColor="#000"
          borderColorActive="#C9F3D5"
          contentStyle={s.cardContent}
          style={s.cardWrapper}
          disabled={true}
        >
          <AppText variant="h2" weight="800">
            {t("profile.delete.title")}
          </AppText>

          <AppText variant="label" weight="700" color="#000000" style={{ marginTop: 6 }}>
            {t("profile.delete.cardExplain")}
          </AppText>

          <OffsetButton
            onPress={() => setShowDeleteModal(true)}
            radius={10}
            bgColor="#DC2626"
            borderColor="#000"
            borderColorActive="#C9F3D5"
            contentStyle={s.buttonContent}
          >
            <AppText variant="button" weight="800" color="#000">
              {t("profile.delete.button")}
            </AppText>
          </OffsetButton>
        </OffsetButton>
      </ScrollView>

      {/* Delete modal */}
      <Modal visible={showDeleteModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <AppText variant="h2" weight="800">
              {t("profile.delete.modalTitle")}
            </AppText>
            <AppText variant="label" weight="700" color="#374151" style={{ marginTop: 8 }}>
              {t("profile.delete.modalExplain")}
            </AppText>

            <AppText variant="caption" color="#000000" style={{ marginTop: 8 }}>
              {t("profile.delete.optionalReason")}
            </AppText>

            <TextInput
              style={[s.input, { color: "#000000" }]}
              placeholder={t("profile.delete.reasonPH_modal")}
              value={deletionReason}
              onChangeText={setDeletionReason}
              multiline
            />

            <View style={{ marginTop: 8 }}>
              <AppText variant="label" weight="700">
                {t("profile.delete.confirmStepTitle")}
              </AppText>
              <AppText variant="caption" color="#6B7280" style={{ marginTop: 10 }}>
                {t("profile.delete.typeToConfirm", { phrase: "DELETE MY ACCOUNT" })}
              </AppText>
              <TextInput
                style={[s.input, { color: "#000" }]}
                placeholder={t("profile.delete.typePH")}
                value={typedConfirm}
                onChangeText={setTypedConfirm}
                autoCapitalize="characters"
              />

              <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 14 }}>
                <OffsetButton
                  onPress={() => confirmTypedDeletion(typedConfirm)}
                  disabled={!confirmChecked || !typedConfirm.trim() || deleteProcessing}
                  radius={10}
                  bgColor="#DC2626"
                  borderColor="#000"
                  borderColorActive="#C9F3D5"
                  contentStyle={{
                    ...s.buttonContent,
                    opacity: (!confirmChecked || !typedConfirm.trim()) ? 0.5 : 1
                  }}
                >
                  <AppText variant="button" weight="800" color="#FFF">
                    {t("profile.delete.confirmDeletion")}
                  </AppText>
                </OffsetButton>
                
                <OffsetButton
                  onPress={() => setShowDeleteModal(false)}
                  radius={10}
                  bgColor="#FFF"
                  borderColor="#000"
                  borderColorActive="#C9F3D5"
                  contentStyle={s.buttonContent}
                >
                  <AppText variant="button" weight="800" color="#000">
                    {t("common.cancel")}
                  </AppText>
                </OffsetButton>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
                <Pressable
                  onPress={() => setConfirmChecked(!confirmChecked)}
                  style={{
                    width: 22,
                    height: 22,
                    borderWidth: 1,
                    borderColor: "#D1D5DB",
                    borderRadius: 4,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: confirmChecked ? "#111827" : "#FFF",
                  }}
                >
                  {confirmChecked ? <Ionicons name="checkmark" size={14} color="#FFF" /> : null}
                </Pressable>
                <AppText variant="caption" color="#6B7280" style={{ marginLeft: 8 }}>
                  {t("profile.delete.confirmStepCheckbox")}
                </AppText>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, backgroundColor: "#FFFAF0" },
  cardWrapper: {
    marginBottom: 12,
  },
  cardContent: {
    padding: 16,
    backgroundColor: 'white',
    borderWidth: 2,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 4,
  },
  block: { marginTop: 6 },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chipContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },

  buttonContent: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 2,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },

  linkButtonContent: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },

  linkRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 6,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    width: "100%",
    maxWidth: 560,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    backgroundColor: "#FBFDFF",
  },

  toggleWrap: {
    width: 52,
    height: 32,
    borderRadius: 20,
    padding: 3,
    justifyContent: "center",
  },
  toggleOn: { backgroundColor: "#16A34A" },
  toggleOff: { backgroundColor: "#D1D5DB" },
  knob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#FFF",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  knobOn: { alignSelf: "flex-end" },
  knobOff: { alignSelf: "flex-start" },
});