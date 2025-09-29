// app/Elderly/profile.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthProvider";
import TopBar, { LangCode } from "../../src/components/TopBar";
// ✅ use the account-scoped version and correct filename/casing
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
  `Please keep it safe. On first open, set a 4+ digit PIN. ` +
  `Use the same PIN next time to unlock. Thank you!`;

// helper: normalize NIL
const isNil = (v?: string | null) =>
  typeof v === "string" && v.trim().toUpperCase() === "NIL";

export default function ElderlyProfile() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  // ✅ account-scoped coins/today from the hook
  const { coins, todayChecked } = useCheckins(session?.userId);
  const { textScale, setTextScale } = useAppSettings();

  // data states
  const [name, setName] = useState<string>("-");
  const [yob, setYob] = useState<string>("-");
  const [emergency, setEmergency] = useState<EmergencyContact | null>(null);
  const [assistiveNeeds, setAssistiveNeeds] = useState<string[]>([]);
  const [drugAllergies, setDrugAllergies] = useState<string>("");
  const [publicNote, setPublicNote] = useState<string>("");
  const [conditions, setConditions] = useState<ConditionItem[]>([]);
  const [streak, setStreak] = useState(0);

  // language via TopBar
  const setLang = async (code: LangCode) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  // fetcher (called on mount + when screen refocuses)
  const loadData = useCallback(async () => {
    if (!session?.userId) return;

    // elderly_profiles (includes assistive fields)
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
    }

    // elderly_conditions + elderly_medications
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
  }, [loadData]);

  // also refresh whenever screen is focused
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // 🔁 Per-user streak from per-user key
  useEffect(() => {
    if (!session?.userId) {
      setStreak(0);
      return;
    }
    const DATES_KEY = `checkin_dates_${session.userId}_v1`;
    const iso = (d = new Date()) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
    const addDays = (date: Date, n: number) => {
      const d = new Date(date);
      d.setDate(d.getDate() + n);
      return d;
    };

    (async () => {
      const raw = (await AsyncStorage.getItem(DATES_KEY)) || "[]";
      let dates: string[] = [];
      try {
        dates = JSON.parse(raw);
      } catch {}
      const set = new Set(dates);
      let s = 0;
      let cur = new Date();
      while (set.has(iso(cur))) {
        s += 1;
        cur = addDays(cur, -1);
      }
      setStreak(s);
    })();
  }, [session?.userId, todayChecked, coins]);

  // global text sizing
  const textScalePx = useMemo(() => {
    switch (textScale) {
      case "md":
        return 16;
      case "lg":
        return 18;
      case "xl":
        return 20;
      default:
        return 18;
    }
  }, [textScale]);

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

  // --- Share EC Portal link ---
  const onShareEcPortal = useCallback(async () => {
    if (!session?.userId) {
      Alert.alert("Not logged in", "Please log in again.");
      return;
    }

    // 1) Try to get the latest token from ec_links
    const { data: linkRow } = await supabase
      .from("ec_links")
      .select("token")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let token: string | null = linkRow?.token ?? null;

    // 2) Optional fallback: RPC to issue/reuse
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

  // Render
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      edges={["top", "left", "right"]}
    >
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={setLang}
        title="Profile"
        showHeart={false}
      />

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Basic Information */}
        <View style={s.card}>
          <Text style={[s.h2, { fontSize: textScalePx + 4 }]}>
            {t("profile.basicInfo")}
          </Text>

          <View style={s.rowBetween}>
            <Text style={[s.k, { fontSize: textScalePx }]}>Name</Text>
            <Text style={[s.v, { fontSize: textScalePx }]}>{name}</Text>
          </View>

          <View style={s.rowBetween}>
            <Text style={[s.k, { fontSize: textScalePx }]}>
              {t("elderlyOnboarding.yobPH")}
            </Text>
            <Text style={[s.v, { fontSize: textScalePx }]}>{yob}</Text>
          </View>

          <Pressable
            onPress={() => router.push("/EditBasic")}
            style={s.linkRow}
          >
            <Ionicons name="create-outline" size={18} />
            <Text style={s.linkText}>{t("profile.editBasic")}</Text>
          </Pressable>
        </View>

        {/* Emergency Health Card */}
        <View style={s.card}>
          <Text style={[s.h2, { fontSize: textScalePx + 4 }]}>
            {t("profile.healthCard")}
          </Text>

          {!!emergency &&
            (emergency.name ||
              emergency.relation ||
              emergency.phone ||
              emergency.email) && (
              <View style={s.block}>
                <Text style={[s.k, { fontSize: textScalePx }]}>
                  {t("profile.emergencyContacts")}
                </Text>
                <Text style={[s.v, { fontSize: textScalePx }]}>
                  {[
                    emergency.name,
                    emergency.relation,
                    emergency.phone,
                    emergency.email,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
            )}

          {/* Always show these rows */}
          <View style={s.block}>
            <Text style={[s.k, { fontSize: textScalePx }]}>
              {t("profile.drugAllergy")}
            </Text>
            <Text style={[s.v, { fontSize: textScalePx }]}>
              {drugAllergies?.trim() || "–"}
            </Text>
          </View>

          <View style={s.block}>
            <Text style={[s.k, { fontSize: textScalePx }]}>
              {t("profile.assistive")}
            </Text>
            <Text style={[s.v, { fontSize: textScalePx }]}>
              {assistiveDisplay?.trim() || "–"}
            </Text>
          </View>

          <View style={s.block}>
            <Text style={[s.k, { fontSize: textScalePx }]}>
              {t("profile.publicNote")}
            </Text>
            <Text style={[s.v, { fontSize: textScalePx }]}>
              {publicNote?.trim() || "–"}
            </Text>
          </View>

          {/* Share EC Portal link button */}
          <Pressable style={s.btn} onPress={onShareEcPortal}>
            <Text style={s.btnText}>Share EC Portal link</Text>
          </Pressable>
        </View>

        {/* Conditions */}
        <View style={s.card}>
          <Text style={[s.h2, { fontSize: textScalePx + 4 }]}>
            {t("profile.conditions")}
          </Text>

          {conditions.length === 0 ? (
            <Text style={[s.v, { fontSize: textScalePx }]}>–</Text>
          ) : (
            <View style={s.block}>
              {conditions.map((c) => {
                const condName =
                  !c.condition || isNil(c.condition) ? "–" : c.condition;

                const medsClean = (c.meds || [])
                  .filter((m) => m.name && !isNil(m.name))
                  .map((m) => {
                    const name = m.name;
                    const freq =
                      m.frequency && !isNil(m.frequency)
                        ? ` — ${m.frequency}`
                        : "";
                    return `${name}${freq}`;
                  });

                const medsPart =
                  medsClean.length > 0 ? ` (${medsClean.join("; ")})` : "";

                return (
                  <Text key={c.id} style={[s.v, { fontSize: textScalePx }]}>
                    • {condName}
                    {medsPart}
                  </Text>
                );
              })}
            </View>
          )}
        </View>

        {/* Activity & Rewards (✅ account-scoped) */}
        <View style={s.card}>
          <Text style={[s.h2, { fontSize: textScalePx + 4 }]}>
            {t("profile.activity")}
          </Text>
          <View style={s.rowBetween}>
            <Text style={[s.k, { fontSize: textScalePx }]}>
              {t("profile.streak")}
            </Text>
            <Text style={[s.v, { fontSize: textScalePx }]}>{streak}</Text>
          </View>
          <View style={s.rowBetween}>
            <Text style={[s.k, { fontSize: textScalePx }]}>
              {t("profile.coins")}
            </Text>
            <Text style={[s.v, { fontSize: textScalePx }]}>{coins}</Text>
          </View>
          <Pressable style={s.btn} onPress={() => router.push("/tabs/Rewards")}>
            <Text style={s.btnText}>{t("rewards.button")}</Text>
          </Pressable>
        </View>

        {/* Accessibility (global text size) */}
        <View style={s.card}>
          <Text style={[s.h2, { fontSize: textScalePx + 4 }]}>
            {t("profile.accessibility")}
          </Text>

          <Text style={[s.k, { marginTop: 2 }]}>{t("profile.textSize")}</Text>
          <View style={s.chipsRow}>
            {(["md", "lg", "xl"] as const).map((sz) => (
              <Text
                key={sz}
                onPress={() => setTextScale(sz)}
                style={[s.chip, textScale === sz && s.chipActive]}
              >
                {sz.toUpperCase()}
              </Text>
            ))}
          </View>

          <Text style={s.note}>{t("profile.accessibilityNote")}</Text>
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
  h2: { fontWeight: "800", color: "#111827", marginBottom: 8, fontSize: 20 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 4,
  },
  k: { color: "#374151", fontWeight: "700" },
  v: { color: "#111827", fontWeight: "700" },
  block: { marginTop: 6 },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFF",
    color: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    fontWeight: "800",
  },
  chipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
    color: "#FFF",
  },

  btn: {
    backgroundColor: "#111827",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  btnText: { color: "#FFF", fontWeight: "800" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  linkText: { fontWeight: "800", color: "#111827" },
  note: { marginTop: 6, color: "#6B7280" },
});
