import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  View,
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
  const { session } = useAuth();

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
    meds?.forEach((m: any) => {
      const arr = medMap.get(m.condition_id) || [];
      arr.push({ name: m.name, frequency: m.frequency });
      medMap.set(m.condition_id, arr);
    });

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

  // Pretty-print assistive codes (and localize)
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

  // Share EC Portal link
  const onShareEcPortal = useCallback(async () => {
    if (!session?.userId) {
      Alert.alert("Not logged in", "Please log in again.");
      return;
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
              Share EC Portal link
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
});
