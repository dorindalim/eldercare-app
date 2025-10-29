import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  ImageBackground,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthProvider";
import AuthTopBar from "../../src/components/AuthTopBar";
import OffsetButton from "../../src/components/OffsetButton";
import { KDRAFT, markAllComplete, useCombinedProgress } from "../../src/lib/progress";

type Med = { name: string; frequency: string };
type ConditionCard = {
  condition: string;
  doctor: string;
  clinic: string;
  appointments: string;
  meds: Med[];
  noMeds: boolean;
};

const BG = require("../../assets/photos/screens/MediumBlob.png");
const SIDE = 20;
const MAXW = 720;
const INSET = 16;
const BUTTON_H = 57;
const BAR_PAD = 8;

type LangCode = "en" | "zh" | "ms" | "ta";
const short = (c: string) => (c === "en" ? "EN" : c === "zh" ? "中文" : c === "ms" ? "BM" : "தமிழ்");

const ASSISTIVE_OPTIONS = [
  { key: "walking_cane", labelKey: "elderlyConditions.assistive.walking_cane" },
  { key: "wheelchair", labelKey: "elderlyConditions.assistive.wheelchair" },
  { key: "hearing_aid", labelKey: "elderlyConditions.assistive.hearing_aid" },
  { key: "glasses", labelKey: "elderlyConditions.assistive.glasses" },
  { key: "other", labelKey: "elderlyConditions.assistive.other" },
];

export default function ElderlyConditions() {
  const router = useRouter();
  const { markOnboarding, saveElderlyConditions } = useAuth();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const [conditions, setConditions] = useState<ConditionCard[]>([
    { condition: "", doctor: "", clinic: "", appointments: "", meds: [{ name: "", frequency: "" }], noMeds: false },
  ]);
  const [assistive, setAssistive] = useState<string[]>([]);
  const [assistiveOther, setAssistiveOther] = useState("");
  const [drugAllergies, setDrugAllergies] = useState("");
  const [publicNote, setPublicNote] = useState("");
  const [noConditions, setNoConditions] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KDRAFT.conditions);
        if (raw) {
          const d = JSON.parse(raw);
          setConditions(d.conditions ?? conditions);
          setAssistive(d.assistive ?? []);
          setAssistiveOther(d.assistiveOther ?? "");
          setDrugAllergies(d.drugAllergies ?? "");
          setPublicNote(d.publicNote ?? "");
          setNoConditions(!!d.noConditions);
        }
      } catch {}
    })();
  }, []);

  const setCond = (idx: number, patch: Partial<ConditionCard>) =>
    setConditions((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });

  const addCondition = () =>
    setConditions((prev) => [
      ...prev,
      { condition: "", doctor: "", clinic: "", appointments: "", meds: [{ name: "", frequency: "" }], noMeds: false },
    ]);

  const removeCondition = (idx: number) =>
    setConditions((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const addMed = (cIdx: number) =>
    setConditions((prev) => {
      const next = [...prev];
      next[cIdx].meds = [...next[cIdx].meds, { name: "", frequency: "" }];
      return next;
    });

  const removeMed = (cIdx: number, mIdx: number) =>
    setConditions((prev) => {
      const next = [...prev];
      if (next[cIdx].meds.length > 1) next[cIdx].meds = next[cIdx].meds.filter((_, i) => i !== mIdx);
      else next[cIdx].meds = [{ name: "", frequency: "" }];
      return next;
    });

  const setMed = (cIdx: number, mIdx: number, patch: Partial<Med>) =>
    setConditions((prev) => {
      const next = [...prev];
      const meds = [...next[cIdx].meds];
      meds[mIdx] = { ...meds[mIdx], ...patch };
      next[cIdx].meds = meds;
      return next;
    });

  const toggleAssistive = (key: string) =>
    setAssistive((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const canSubmit = useMemo(() => {
    const hasAnyCondition = noConditions || conditions.some((c) => c.condition.trim());
    const allConditionsPassMedRule =
      noConditions || conditions.every((c) => c.noMeds || c.meds.some((m) => m.name.trim()));
    const anyExtras =
      assistive.length > 0 || !!assistiveOther.trim() || !!drugAllergies.trim() || !!publicNote.trim();
    return (hasAnyCondition && allConditionsPassMedRule) || anyExtras;
  }, [conditions, noConditions, assistive, assistiveOther, drugAllergies, publicNote]);

  const conditionsProgress = useMemo(() => {
    let p = 0;
    const hasAnyCondition = noConditions || conditions.some((c) => c.condition.trim());
    if (hasAnyCondition) p += 0.34;
    const medsOk = noConditions || conditions.some((c) => c.noMeds || c.meds.some((m) => m.name.trim()));
    if (medsOk) p += 0.33;
    const extras =
      assistive.length > 0 || !!assistiveOther.trim() || !!drugAllergies.trim() || !!publicNote.trim();
    if (extras) p += 0.33;
    return Math.min(1, p);
  }, [noConditions, conditions, assistive, assistiveOther, drugAllergies, publicNote]);

  const combined = useCombinedProgress("conditions", conditionsProgress);

  const saveDraft = async () => {
    const draft = { conditions, assistive, assistiveOther, drugAllergies, publicNote, noConditions };
    await AsyncStorage.setItem(KDRAFT.conditions, JSON.stringify(draft));
    Alert.alert(t("common.save"), t("elderlyOnboarding.draftSaved"));
  };

  const onSubmit = async () => {
    if (!noConditions) {
      const hasCondition = conditions.some((c) => c.condition.trim());
      if (!hasCondition) return Alert.alert(t("elderlyConditions.errors.missingConditionName"));
    }
    const hasInvalidMed = conditions.some(
      (c) => !c.noMeds && c.meds.some((m) => !m.name.trim() && m.frequency.trim())
    );
    if (hasInvalidMed) return Alert.alert(t("elderlyConditions.errors.invalidMed"));

    let cleanConds: Array<{
      condition: string;
      doctor?: string;
      clinic?: string;
      appointments?: string;
      medications: { name: string; frequency?: string }[];
    }> = [];

    if (noConditions) {
      cleanConds = [
        {
          condition: "NIL",
          doctor: "NIL",
          clinic: "NIL",
          appointments: "NIL",
          medications: [{ name: "NIL", frequency: "NIL" }],
        },
      ];
    } else {
      cleanConds = conditions
        .map((c) => {
          const meds = c.noMeds
            ? [{ name: "NIL", frequency: "NIL" }]
            : c.meds
                .map((m) => ({ name: m.name.trim(), frequency: m.frequency.trim() || undefined }))
                .filter((m) => m.name);
          return {
            condition: c.condition.trim(),
            doctor: c.doctor.trim() || undefined,
            clinic: c.clinic.trim() || undefined,
            appointments: c.appointments.trim() || undefined,
            medications: meds,
          };
        })
        .filter(
          (c) =>
            c.condition ||
            (c.medications && c.medications.length) ||
            c.doctor ||
            c.clinic ||
            c.appointments
        );
    }

    const extras = {
      assistive_needs: [
        ...assistive.filter((k) => k !== "other"),
        ...(assistive.includes("other") && assistiveOther.trim() ? [`other:${assistiveOther.trim()}`] : []),
      ],
      drug_allergies: drugAllergies.trim() || undefined,
      public_note: publicNote.trim() || undefined,
    };

    const { success } = await saveElderlyConditions(cleanConds, extras);
    if (!success) return Alert.alert(t("elderlyConditions.errors.saveFailed"));

    await markOnboarding(true);
    await markAllComplete();

    const keysToKeep = [
      'user-session',
      'auth-token', 
      'user-id',
      'lang', 
    ];

    try {
      console.log("Clearing all onboarding data...");
      
      const allKeys = await AsyncStorage.getAllKeys();
      
      // Filter for any keys related to onboarding/drafts/progress
      const onboardingKeys = allKeys.filter(key => 
        key.includes('draft') || 
        key.includes('progress') ||
        key.includes('onboarding')
      );
      
      console.log("Deleting onboarding keys:", onboardingKeys);
      
      if (onboardingKeys.length > 0) {
        await AsyncStorage.multiRemove(onboardingKeys);
      }
      
      console.log("All onboarding data cleared successfully");
      
    } catch (error) {
      console.log("Error clearing onboarding data:", error);
    }

    await AsyncStorage.setItem(
      KDRAFT.conditions,
      JSON.stringify({ conditions, assistive, assistiveOther, drugAllergies, publicNote, noConditions })
    );

    router.replace("/Onboarding/Success");
  };

  const extraBottomSpace = insets.bottom + BUTTON_H + BAR_PAD * 2 + 18;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent barStyle="dark-content" backgroundColor="transparent" />
      <ImageBackground source={BG} style={s.bg} resizeMode="cover">
        <SafeAreaView style={s.safe}>
          {/* Top bar */}
          <AuthTopBar
            onBack={() => {
              if (router.canGoBack?.()) router.back();
              else router.replace("/Onboarding/ElderlyBasics");
            }}
            langShort={short(i18n.language)}
            onOpenLanguage={async () => {
              const order: LangCode[] = ["en", "zh", "ms", "ta"];
              const next = order[(order.indexOf(i18n.language as LangCode) + 1) % order.length];
              await i18n.changeLanguage(next);
              await AsyncStorage.setItem("lang", next);
            }}
            maxWidth={MAXW}
            horizontalPadding={INSET}
            progress={combined}
          />

          {/* Content */}
          <KeyboardAwareScrollView
            style={{ flex: 1, backgroundColor: "transparent" }}
            contentContainerStyle={[s.scroll, { paddingBottom: extraBottomSpace }]}
            enableOnAndroid
            enableAutomaticScroll
            extraScrollHeight={24}
            extraHeight={Platform.OS === "android" ? 120 : 0}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={s.card}>
              <Text style={s.heroTitle}>
                {t("elderlyConditions.hero")}
              </Text>

              {/* Top switches */}
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <Pressable
                  onPress={() => setNoConditions((v) => !v)}
                  style={[s.checkPill, noConditions && s.checkPillOn]}
                >
                  <Text style={[s.checkPillText, noConditions && s.checkPillTextOn]}>
                    {t("elderlyConditions.noConditions")}
                  </Text>
                </Pressable>
              </View>

              {!noConditions && (
                <>
                  {conditions.map((c, idx) => (
                    <View key={idx} style={s.cardInner}>
                      <View style={s.cardHeader}>
                        <Text style={s.cardTitle}>
                          {t("elderlyConditions.conditionTitle", { index: idx + 1 })}
                        </Text>
                        <Pressable
                          onPress={() => removeCondition(idx)}
                          disabled={conditions.length === 1}
                          style={[s.removeBtn, conditions.length === 1 && { opacity: 0.4 }]}
                        >
                          <Text style={s.removeBtnText}>{t("elderlyConditions.remove")}</Text>
                        </Pressable>
                      </View>

                      <TextInput
                        placeholder={t("elderlyConditions.conditionPH")}
                        placeholderTextColor="#9CA3AF"
                        value={c.condition}
                        onChangeText={(v) => setCond(idx, { condition: v })}
                        style={s.input}
                      />

                      <TextInput
                        placeholder={t("elderlyConditions.doctorPH")}
                        placeholderTextColor="#9CA3AF"
                        value={c.doctor}
                        onChangeText={(v) => setCond(idx, { doctor: v })}
                        style={s.input}
                      />

                      <TextInput
                        placeholder={t("elderlyConditions.clinicPH")}
                        placeholderTextColor="#9CA3AF"
                        value={c.clinic}
                        onChangeText={(v) => setCond(idx, { clinic: v })}
                        style={s.input}
                      />

                      <TextInput
                        placeholder={t("elderlyConditions.appointmentsPH")}
                        placeholderTextColor="#9CA3AF"
                        value={c.appointments}
                        onChangeText={(v) => setCond(idx, { appointments: v })}
                        style={[s.input, s.multiline]}
                        multiline
                      />

                      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                        <Pressable
                          onPress={() => setCond(idx, { noMeds: !c.noMeds })}
                          style={[s.checkPill, c.noMeds && s.checkPillOn]}
                        >
                          <Text style={[s.checkPillText, c.noMeds && s.checkPillTextOn]}>
                            {t("elderlyConditions.noMedicationsForThis")}
                          </Text>
                        </Pressable>
                      </View>

                      {!c.noMeds && (
                        <>
                          <Text style={s.subLabel}>{t("elderlyConditions.medsLabel")}</Text>
                          {c.meds.map((m, mIdx) => (
                            <View key={mIdx} style={s.medRow}>
                              <TextInput
                                placeholder={t("elderlyConditions.medNamePH")}
                                placeholderTextColor="#9CA3AF"
                                value={m.name}
                                onChangeText={(v) => setMed(idx, mIdx, { name: v })}
                                style={[s.input, { flex: 1, marginBottom: 0 }]}
                              />
                              <View style={{ width: 8 }} />
                              <TextInput
                                placeholder={t("elderlyConditions.medFreqPH")}
                                placeholderTextColor="#9CA3AF"
                                value={m.frequency}
                                onChangeText={(v) => setMed(idx, mIdx, { frequency: v })}
                                style={[s.input, { flex: 1, marginBottom: 0 }]}
                              />
                              <Pressable onPress={() => removeMed(idx, mIdx)} style={[s.smallBtn, { marginLeft: 8 }]}>
                                <Text style={s.smallBtnText}>{t("elderlyConditions.remove")}</Text>
                              </Pressable>
                            </View>
                          ))}
                          <Pressable onPress={() => addMed(idx)} style={[s.addBtn, { marginTop: 8 }]}>
                            <Text style={s.addBtnText}>{t("elderlyConditions.addMed")}</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  ))}

                  <Pressable onPress={addCondition} style={s.addBtn}>
                    <Text style={s.addBtnText}>{t("elderlyConditions.addCondition")}</Text>
                  </Pressable>
                </>
              )}

              <Text style={[s.heading, { marginTop: 8 }]}>{t("elderlyConditions.assistive.label")}</Text>
              <View style={s.chipsRow}>
                {ASSISTIVE_OPTIONS.map((opt) => {
                  const active = assistive.includes(opt.key);
                  return (
                    <Pressable key={opt.key} onPress={() => toggleAssistive(opt.key)}>
                      <Text style={[s.chip, active && s.chipActive]}>{t(opt.labelKey)}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {assistive.includes("other") && (
                <TextInput
                  placeholder={t("elderlyConditions.assistive.otherPH")}
                  placeholderTextColor="#9CA3AF"
                  value={assistiveOther}
                  onChangeText={setAssistiveOther}
                  style={s.input}
                />
              )}

              <TextInput
                placeholder={t("elderlyConditions.drugAllergiesPH")}
                placeholderTextColor="#9CA3AF"
                value={drugAllergies}
                onChangeText={setDrugAllergies}
                style={[s.input, s.multiline]}
                multiline
              />

              <TextInput
                placeholder={t("elderlyConditions.publicNotePH")}
                placeholderTextColor="#9CA3AF"
                value={publicNote}
                onChangeText={setPublicNote}
                style={[s.input, s.multiline]}
                multiline
              />
            </View>
          </KeyboardAwareScrollView>

          {/* Sticky footer overlay */}
          <View style={s.footerOverlay} pointerEvents="box-none">
            <View style={s.footerEdge} />
            <View style={[s.footerRowWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
              <View style={s.footerRow}>
                <OffsetButton
                  label={t("common.save")}
                  onPress={saveDraft}
                  height={BUTTON_H}
                  radius={12}
                  bgColor="#FFFAF0"
                  style={{ flex: 1, marginRight: 10 }}
                />
                <OffsetButton
                  label={t("elderlyConditions.finish")}
                  onPress={onSubmit}
                  disabled={!canSubmit}
                  height={BUTTON_H}
                  radius={12}
                  style={{ flex: 1, marginLeft: 10, opacity: canSubmit ? 1 : 0.6 }}
                />
              </View>
            </View>
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, width: "100%", height: "100%" },
  safe: { flex: 1, paddingHorizontal: SIDE },

  scroll: { flexGrow: 1, paddingTop: 6 },

  card: { width: "100%", maxWidth: MAXW, alignSelf: "center", backgroundColor: "transparent" },

  heroTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 12,
  },

  heading: { fontSize: 20, fontWeight: "800", marginBottom: 10, color: "#0F1724" },
  subLabel: { fontWeight: "700", color: "#0F1724", marginBottom: 8 },

  input: {
    borderWidth: 2,
    borderColor: "#1F2937",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#FFF",
    marginBottom: 12,
  },
  multiline: { minHeight: 88, textAlignVertical: "top" },

  cardInner: {
    borderWidth: 1,
    borderColor: "#E8EDF2",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#021627",
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },

  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  cardTitle: { fontWeight: "800", color: "#0F1724" },

  removeBtn: {
    borderWidth: 1,
    borderColor: "#F87171",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#FFF",
  },
  removeBtnText: { color: "#F87171", fontWeight: "800", fontSize: 12 },

  addBtn: {
    borderWidth: 1,
    borderColor: "#0F1724",
    backgroundColor: "#0F1724",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  addBtnText: { color: "#FFFFFF", fontWeight: "800" },

  medRow: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    borderWidth: 1,
    borderColor: "#E6EDF5",
    backgroundColor: "#FFF",
    color: "#0F1724",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    fontWeight: "800",
  },
  chipActive: { backgroundColor: "#0F1724", borderColor: "#0F1724", color: "#FFFFFF" },

  smallBtn: {
    borderWidth: 1,
    borderColor: "#F87171",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "center",
  },
  smallBtnText: { color: "#F87171", fontWeight: "800", fontSize: 12 },

  checkPill: {
    borderWidth: 1,
    borderColor: "#E6EDF5",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  checkPillOn: { backgroundColor: "#0F1724", borderColor: "#0F1724" },
  checkPillText: { color: "#0F1724", fontWeight: "800" },
  checkPillTextOn: { color: "#FFFFFF" },

  footerOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#CFADE8",
  },
  footerEdge: {
    height: 2,
    backgroundColor: "#111827",
    alignSelf: "stretch",
  },
  footerRowWrap: {
    paddingTop: BAR_PAD,
    paddingHorizontal: SIDE,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});
