import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import TopBar, { LangCode } from "../../src/components/TopBar";
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

const PORTAL_BASE_URL =
  "https://dorindalim.github.io/eldercare-app/ECPortal.html";
const CAREGIVER_MESSAGE = (url: string) =>
  `Hi! This is my Emergency Contact Portal link:\n\n${url}\n\n` +
  `Please keep it safe. On first open, set a 4+ digit PIN. Use the same PIN next time to unlock. Thank you!`;

const isNil = (v?: string | null) =>
  typeof v === "string" && v.trim().toUpperCase() === "NIL";

export default function ElderlyProfile() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { session, logout } = useAuth();

  const {
    coins,
    streak,
    refresh: refreshCheckins,
  } = useCheckins(session?.userId);

  const { textScale, setTextScale } = useAppSettings();

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
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0); 
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [deleteProcessing, setDeleteProcessing] = useState(false);
  const [scheduledDeletion, setScheduledDeletion] = useState<string | null>(null);

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
      setAssistiveNeeds(
        Array.isArray(prof.assistive_needs) ? prof.assistive_needs : []
      );
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
      .in("condition_id", ids);

    const medMap = new Map<
      string,
      { name: string; frequency?: string | null }[]
    >();
    const merged: ConditionItem[] = conds.map((c: any) => ({
      id: c.id,
      condition: c.condition,
      doctor: c.doctor,
      clinic: c.clinic,
      appointments: c.appointments,
      meds: medMap.get(c.id) || [],
    }));
    setConditions(merged);
  }, [session?.userId]);

  useEffect(() => {
    loadData();
    refreshCheckins();
  }, [loadData, refreshCheckins]);

  const confirmTypedDeletion = async (typed: string) => {
    if (!session?.userId) {
      Alert.alert(t('auth.notLoggedInTitle'), t('auth.notLoggedInBody'));
      return;
    }

    const expected = 'DELETE MY ACCOUNT';
    if (typed.trim().toUpperCase() !== expected) {
      Alert.alert(t('common.error'), t('delete.typeMismatch') || 'Please type the exact phrase to confirm.');
      return;
    }

    setDeleteProcessing(true);
    try {
      const now = new Date();
      const scheduled = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      const { error } = await supabase
        .from('elderly_profiles')
        .update({
          scheduled_for: scheduled.toISOString(),
          deletion_reason: deletionReason || null,
          deletion_requested_at: new Date().toISOString(),
          deletion_status: 'deletion_scheduled',
        })
        .eq('user_id', session.userId);

      if (error) {
        Alert.alert(t('common.error'), error.message || t('delete.failedSchedule'));
        return;
      }

      Alert.alert(t('delete.scheduledAlertTitle'), t('delete.scheduledBody'));
      setShowDeleteModal(false);
      try {
        await logout();
      } catch (e) {
      }
      router.replace('/Authentication/LogIn');
    } finally {
      setDeleteProcessing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
      refreshCheckins();
    }, [loadData, refreshCheckins])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadData(), refreshCheckins()]);
    setRefreshing(false);
  }, [loadData, refreshCheckins]);

  useEffect(() => {
    if (!session?.userId) return;
    const handle = () => {
      loadData();
      refreshCheckins();
    };

    const ch = supabase
      .channel(`ec:${session.userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "elderly_profiles",
          filter: `user_id=eq.${session.userId}`,
        },
        handle
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "elderly_conditions",
          filter: `user_id=eq.${session.userId}`,
        },
        handle
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "elderly_medications" },
        handle
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [session?.userId, loadData, refreshCheckins]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        loadData();
        refreshCheckins();
      }
    });
    return () => sub.remove();
  }, [loadData, refreshCheckins]);

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
      Alert.alert(t('common.notLoggedIn'), t('common.pleaseLoginAgain'));
      return;
    }

    // Check profile deletion status first — if account is scheduled for deletion,
    // the portal should not be shareable.
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
          // fallback text if translation missing
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
      const { data: rpcToken, error: rpcErr } = await supabase.rpc(
        "ec_issue_link_if_ready_for",
        { p_user: session.userId }
      );
      if (rpcErr)
        console.warn("ec_issue_link_if_ready_for error:", rpcErr.message);
      token = rpcToken ?? null;
    }

    if (!token) {
      Alert.alert(
        "No portal link yet",
        "Your profile may be incomplete, or a link hasn’t been created."
      );
      return;
    }

    const url = `${PORTAL_BASE_URL}?token=${encodeURIComponent(token)}`;
    await Share.share({ message: CAREGIVER_MESSAGE(url) });
  }, [session?.userId]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["left", "right"]}>
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={setLang}
        bgColor="#D2AB80"
        includeTopInset={true}
        barHeight={44}
        topPadding={2}
        title={t("profile.title")}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/LogIn");
        }}
      />

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Basic Information */}
        <View style={s.card}>
          <AppText variant="h2" weight="800">
            {t("profile.basicInfo")}
          </AppText>

          <View style={s.rowBetween}>
            <AppText variant="label" weight="700" color="#374151">
              Name
            </AppText>
            <AppText variant="label" weight="700">
              {name}
            </AppText>
          </View>

          <View style={s.rowBetween}>
            <AppText variant="label" weight="700" color="#374151">
              {t("elderlyOnboarding.yobPH")}
            </AppText>
            <AppText variant="label" weight="700">
              {yob}
            </AppText>
          </View>

          <Pressable
            onPress={() => router.push("/EditBasic")}
            style={s.linkRow}
          >
            <Ionicons name="create-outline" size={18} />
            <AppText variant="button" weight="800" color="#111827">
              {t("profile.editBasic")}
            </AppText>
          </Pressable>
        </View>

        {/* Emergency Health Card */}
        <View style={s.card}>
          <AppText variant="h2" weight="800">
            {t("profile.healthCard")}
          </AppText>

          {!!emergency &&
            (emergency.name ||
              emergency.relation ||
              emergency.phone ||
              emergency.email) && (
              <View style={s.block}>
                <AppText variant="label" weight="700" color="#374151">
                  {t("profile.emergencyContacts")}
                </AppText>
                <AppText variant="label" weight="700">
                  {[
                    emergency.name,
                    emergency.relation,
                    emergency.phone,
                    emergency.email,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </AppText>
              </View>
            )}

          {/* Always show these rows */}
          <View style={s.block}>
            <AppText variant="label" weight="700" color="#374151">
              {t("profile.drugAllergy")}
            </AppText>
            <AppText variant="label" weight="700">
              {drugAllergies?.trim() || "–"}
            </AppText>
          </View>

          <View style={s.block}>
            <AppText variant="label" weight="700" color="#374151">
              {t("profile.assistive")}
            </AppText>
            <AppText variant="label" weight="700">
              {assistiveDisplay?.trim() || "–"}
            </AppText>
          </View>

          <View style={s.block}>
            <AppText variant="label" weight="700" color="#374151">
              {t("profile.publicNote")}
            </AppText>
            <AppText variant="label" weight="700">
              {publicNote?.trim() || "–"}
            </AppText>
          </View>

          {/* Share EC Portal link button */}
          <Pressable style={s.btn} onPress={onShareEcPortal}>
            <AppText variant="button" weight="800" color="#FFF">
              {t('profile.sharePortal')}
            </AppText>
          </Pressable>
        </View>

        {/* Conditions */}
        <View style={s.card}>
          <AppText variant="h2" weight="800">
            {t("profile.conditions")}
          </AppText>

          {conditions.length === 0 ? (
            <AppText variant="label" weight="700">
              –
            </AppText>
          ) : (
            <View style={s.block}>
              {conditions.map((c) => {
                const condName =
                  !c.condition || isNil(c.condition) ? "–" : c.condition;

                const medsClean = (c.meds || [])
                  .filter((m) => m.name && !isNil(m.name))
                  .map((m) => {
                    const freq =
                      m.frequency && !isNil(m.frequency)
                        ? ` — ${m.frequency}`
                        : "";
                    return `${m.name}${freq}`;
                  });

                const medsPart =
                  medsClean.length > 0 ? ` (${medsClean.join("; ")})` : "";

                return (
                  <AppText key={c.id} variant="label" weight="700">
                    • {condName}
                    {medsPart}
                  </AppText>
                );
              })}
            </View>
          )}
        </View>

        {/* Activity & Rewards */}
        <View style={s.card}>
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

          <Pressable style={s.btn} onPress={() => router.push("/tabs/Rewards")}>
            <AppText variant="button" weight="800" color="#FFF">
              {t("rewards.title")}
            </AppText>
          </Pressable>
        </View>

        {/* Accessibility (global text size) */}
        <View style={s.card}>
          <AppText variant="h2" weight="800">
            {t("profile.accessibility")}
          </AppText>

          <AppText
            variant="label"
            weight="700"
            color="#374151"
            style={{ marginTop: 2 }}
          >
            {t("profile.textSize")}
          </AppText>

          <View style={s.chipsRow}>
            {(["md", "lg", "xl"] as const).map((sz) => (
              <Pressable
                key={sz}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  e?.preventDefault?.();
                  setTextScale(sz);
                }}
                accessibilityRole="button"
                style={[s.chip, textScale === sz && s.chipActive]}
              >
                <AppText
                  variant="button"
                  weight="800"
                  color={textScale === sz ? "#FFF" : "#111827"}
                >
                  {sz.toUpperCase()}
                </AppText>
              </Pressable>
            ))}
          </View>

          <AppText variant="caption" color="#6B7280" style={{ marginTop: 6 }}>
            {t("profile.accessibilityNote")}
          </AppText>
        </View>

        <View style={{ height: 24 }} />

        {/* Delete modal */}
        <Modal visible={showDeleteModal} animationType="slide" transparent>
          <Pressable style={s.modalOverlay} onPress={() => { Keyboard.dismiss(); }}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={s.modalFlex}
            >
              <ScrollView
                contentContainerStyle={s.modalScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={s.modalCard} onStartShouldSetResponder={() => true}>
              <AppText variant="h2" weight="800">
                {t("profile.delete.modalTitle")}
              </AppText>
              <AppText
                variant="label"
                weight="700"
                color="#374151"
                style={{ marginTop: 8 }}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
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
              {/* Simplified single-step deletion flow */}
              <View style={{ marginTop: 8 }}>
                <AppText variant="label" weight="700">{t("profile.delete.confirmStepTitle")}</AppText>
                <AppText variant="caption" color="#6B7280" style={{ marginTop: 10 }}>{t("profile.delete.typeToConfirm", { phrase: 'DELETE MY ACCOUNT' })}</AppText>
                <TextInput
                  style={[s.input, { color: "#000" }]}
                  placeholder={t('profile.delete.typePH')}
                  value={typedConfirm}
                  onChangeText={setTypedConfirm}
                  autoCapitalize="characters"
                />

                <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 14 }}>
                  <Pressable
                    style={[s.btn, { backgroundColor: "#DC2626" }, (!confirmChecked || !typedConfirm.trim()) && { opacity: 0.5 }]}
                    onPress={() => confirmTypedDeletion(typedConfirm)}
                    disabled={!confirmChecked || !typedConfirm.trim() || deleteProcessing}
                  >
                    <AppText variant="button" weight="800" color="#FFF">{t('profile.delete.confirmDeletion')}</AppText>
                  </Pressable>
                  <Pressable style={[s.btn, s.btnSecondary]} onPress={() => setShowDeleteModal(false)}>
                    <AppText variant="button" weight="800" color="#111827">{t('common.cancel')}</AppText>
                  </Pressable>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
                  <Pressable
                    onPress={() => setConfirmChecked(!confirmChecked)}
                    style={{ width: 22, height: 22, borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 4, alignItems: "center", justifyContent: "center", backgroundColor: confirmChecked ? "#111827" : "#FFF" }}
                  >
                    {confirmChecked ? <Ionicons name="checkmark" size={14} color="#FFF" /> : null}
                  </Pressable>
                  <AppText variant="caption" color="#6B7280" style={{ marginLeft: 8 }}>{t("profile.delete.confirmStepCheckbox")}</AppText>
                </View>
              </View>
                  <View style={{ height: 12 }} />

                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </Pressable>
        </Modal>
        {/* Delete Account Section */}
        <View style={s.card}>
          <AppText variant="h2" weight="800">
            {t("profile.delete.title")}
          </AppText>

          <AppText variant="label" weight="700" color="#000000" style={{ marginTop: 6 }}>
            {t("delete.cardExplain")}
          </AppText>

          <AppText variant="caption" color="#6B7280" style={{ marginTop: 8 }}>
            {t("profile.delete.scheduledBody")}
          </AppText>

          <Pressable
            style={[s.btn, { backgroundColor: "#DC2626", marginTop: 12 }]}
            onPress={() => setShowDeleteModal(true)}
          >
            <AppText variant="button" weight="800" color="#FFF">
              {t("profile.delete.button")}
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 12,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 4,
  },
  block: { marginTop: 6 },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },

  btn: {
    backgroundColor: "#111827",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },

  linkRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(2,6,23,0.45)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#E5E7EB", width: "100%", maxWidth: 560 },
  modalFlex: { flex: 1, width: "100%", justifyContent: "center" },
  modalScrollContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 10, marginTop: 8, backgroundColor: "#FBFDFF" },
  errorText: { color: "#DC2626", marginTop: 6 },
  btnSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#E5E7EB" },
});