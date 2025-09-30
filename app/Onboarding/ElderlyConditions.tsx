import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthProvider";
import { supabase } from "../../src/lib/supabase";

type Med = { name: string; frequency: string };
type ConditionCard = {
  condition: string;
  doctor: string;
  clinic: string;
  appointments: string;
  meds: Med[];
  noMeds: boolean;
};

const PORTAL_BASE_URL =
  "https://dorindalim.github.io/eldercare-app/ECPortal.html";

const ASSISTIVE_OPTIONS = [
  { key: "walking_cane", labelKey: "elderlyConditions.assistive.walking_cane" },
  { key: "wheelchair", labelKey: "elderlyConditions.assistive.wheelchair" },
  { key: "hearing_aid", labelKey: "elderlyConditions.assistive.hearing_aid" },
  { key: "glasses", labelKey: "elderlyConditions.assistive.glasses" },
  { key: "other", labelKey: "elderlyConditions.assistive.other" },
];

const CAREGIVER_MESSAGE = (url: string) =>
  `Hi! This is my Emergency Contact Portal link:\n\n${url}\n\n` +
  `Please keep it safe. On first open, set a 4+ digit PIN. ` +
  `Use the same PIN next time to unlock. Thank you!`;

export default function ElderlyConditions() {
  const router = useRouter();
  const { markOnboarding, saveElderlyConditions, session } = useAuth();
  const { t } = useTranslation();

  const [conditions, setConditions] = useState<ConditionCard[]>([
    {
      condition: "",
      doctor: "",
      clinic: "",
      appointments: "",
      meds: [{ name: "", frequency: "" }],
      noMeds: false,
    },
  ]);
  const [assistive, setAssistive] = useState<string[]>([]);
  const [assistiveOther, setAssistiveOther] = useState("");
  const [drugAllergies, setDrugAllergies] = useState("");
  const [publicNote, setPublicNote] = useState("");

  const [noConditions, setNoConditions] = useState(false);

  const canSubmit = useMemo(() => {
    const hasAnyCondition =
      noConditions || conditions.some((c) => c.condition.trim());

    // For each condition: either it has noMeds OR at least one med name
    const allConditionsPassMedRule =
      noConditions ||
      conditions.every((c) => c.noMeds || c.meds.some((m) => m.name.trim()));

    const anyExtras =
      assistive.length > 0 ||
      !!assistiveOther.trim() ||
      !!drugAllergies.trim() ||
      !!publicNote.trim();

    return (hasAnyCondition && allConditionsPassMedRule) || anyExtras;
  }, [
    conditions,
    noConditions,
    assistive,
    assistiveOther,
    drugAllergies,
    publicNote,
  ]);

  const setCond = (idx: number, patch: Partial<ConditionCard>) =>
    setConditions((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });

  const addCondition = () =>
    setConditions((prev) => [
      ...prev,
      {
        condition: "",
        doctor: "",
        clinic: "",
        appointments: "",
        meds: [{ name: "", frequency: "" }],
        noMeds: false,
      },
    ]);

  const removeCondition = (idx: number) =>
    setConditions((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
    );

  const addMed = (cIdx: number) =>
    setConditions((prev) => {
      const next = [...prev];
      next[cIdx].meds = [...next[cIdx].meds, { name: "", frequency: "" }];
      return next;
    });

  const removeMed = (cIdx: number, mIdx: number) =>
    setConditions((prev) => {
      const next = [...prev];
      if (next[cIdx].meds.length > 1) {
        next[cIdx].meds = next[cIdx].meds.filter((_, i) => i !== mIdx);
      } else {
        next[cIdx].meds = [{ name: "", frequency: "" }];
      }
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
    setAssistive((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  const onSubmit = async () => {
    if (!session) {
      return Alert.alert(t("common.notLoggedIn"), t("common.pleaseLoginAgain"));
    }

    if (!noConditions) {
      const hasCondition = conditions.some((c) => c.condition.trim());
      if (!hasCondition) {
        return Alert.alert(t("elderlyConditions.errors.missingConditionName"));
      }
    }

    const hasInvalidMed = conditions.some(
      (c) =>
        !c.noMeds && c.meds.some((m) => !m.name.trim() && m.frequency.trim())
    );
    if (hasInvalidMed) {
      return Alert.alert(t("elderlyConditions.errors.invalidMed"));
    }

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
                .map((m) => ({
                  name: m.name.trim(),
                  frequency: m.frequency.trim() || undefined,
                }))
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
        ...(assistive.includes("other") && assistiveOther.trim()
          ? [`other:${assistiveOther.trim()}`]
          : []),
      ],
      drug_allergies: drugAllergies.trim() || undefined,
      public_note: publicNote.trim() || undefined,
    };

    const res = await saveElderlyConditions(cleanConds, extras);
    if (!res?.success) {
      return Alert.alert(t("elderlyConditions.errors.saveFailed"));
    }

    await markOnboarding(true);

    try {
      const userId = session?.userId;
      if (!userId) {
        console.warn("No user in session");
      } else {
        const { data: token, error } = await supabase.rpc(
          "ec_issue_link_if_ready_for",
          { p_user: userId }
        );
        if (error) {
          console.warn("ec_issue_link_if_ready_for error:", error.message);
        } else if (token) {
          const url = `${PORTAL_BASE_URL}?token=${encodeURIComponent(
            token as string
          )}`;
          await Share.share({ message: CAREGIVER_MESSAGE(url) });
        } else {
          console.log("Profile not ready yet; no token returned");
        }
      }
    } catch (e: any) {
      console.warn("share link failed:", e?.message || e);
    }

    router.replace("/tabs/HomePage");
  };

  const CheckPill = ({
    checked,
    label,
    onPress,
  }: {
    checked: boolean;
    label: string;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      style={[s.checkPill, checked && s.checkPillOn]}
    >
      <Text style={[s.checkPillText, checked && s.checkPillTextOn]}>
        {checked ? "✓ " : ""}
        {label}
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={s.safe} edges={["left", "right"]}>
      <KeyboardAwareScrollView
        style={{ flex: 1, backgroundColor: "#F8FAFC" }}
        contentContainerStyle={s.scroll}
        enableOnAndroid
        enableAutomaticScroll
        extraScrollHeight={24}
        extraHeight={Platform.OS === "android" ? 120 : 0}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.card}>
          <Text style={s.heading}>{t("elderlyConditions.title")}</Text>

          {/* Global toggle: No conditions */}
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            <CheckPill
              checked={noConditions}
              label={t("elderlyConditions.noConditions")}
              onPress={() => setNoConditions((v) => !v)}
            />
          </View>

          {/* Conditions section (hidden when 'no conditions') */}
          {!noConditions && (
            <>
              {conditions.map((c, idx) => (
                <View key={idx} style={s.cardInner}>
                  <View style={s.cardHeader}>
                    <Text style={s.cardTitle}>
                      {t("elderlyConditions.conditionTitle", {
                        index: idx + 1,
                      })}
                    </Text>
                    <Pressable
                      onPress={() => removeCondition(idx)}
                      disabled={conditions.length === 1}
                      style={[
                        s.removeBtn,
                        conditions.length === 1 && { opacity: 0.4 },
                      ]}
                    >
                      <Text style={s.removeBtnText}>
                        {t("elderlyConditions.remove")}
                      </Text>
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

                  {/* Per-condition toggle: No medications for this condition */}
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      flexWrap: "wrap",
                      marginBottom: 8,
                    }}
                  >
                    <CheckPill
                      checked={c.noMeds}
                      label={t("elderlyConditions.noMedicationsForThis")}
                      onPress={() => setCond(idx, { noMeds: !c.noMeds })}
                    />
                  </View>

                  {/* Medication section hidden when per-condition 'noMeds' is true */}
                  {!c.noMeds && (
                    <>
                      <Text style={s.subLabel}>
                        {t("elderlyConditions.medsLabel")}
                      </Text>
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
                            onChangeText={(v) =>
                              setMed(idx, mIdx, { frequency: v })
                            }
                            style={[s.input, { flex: 1, marginBottom: 0 }]}
                          />
                          <Pressable
                            onPress={() => removeMed(idx, mIdx)}
                            style={[s.smallBtn, { marginLeft: 8 }]}
                          >
                            <Text style={s.smallBtnText}>
                              {t("elderlyConditions.removeMed")}
                            </Text>
                          </Pressable>
                        </View>
                      ))}
                      <Pressable
                        onPress={() => addMed(idx)}
                        style={[s.addBtn, { marginTop: 8 }]}
                      >
                        <Text style={s.addBtnText}>
                          {t("elderlyConditions.addMed")}
                        </Text>
                      </Pressable>
                    </>
                  )}
                </View>
              ))}

              <Pressable onPress={addCondition} style={s.addBtn}>
                <Text style={s.addBtnText}>
                  {t("elderlyConditions.addCondition")}
                </Text>
              </Pressable>
            </>
          )}

          <Text style={[s.heading, { marginTop: 8 }]}>
            {t("elderlyConditions.assistive.label")}
          </Text>
          <View style={s.chipsRow}>
            {ASSISTIVE_OPTIONS.map((opt) => {
              const active = assistive.includes(opt.key);
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => toggleAssistive(opt.key)}
                >
                  <Text style={[s.chip, active && s.chipActive]}>
                    {t(opt.labelKey)}
                  </Text>
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

          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit}
            style={[s.btn, !canSubmit && s.btnDisabled]}
          >
            <Text style={s.btnText}>{t("elderlyConditions.finish")}</Text>
          </Pressable>

          <View style={{ height: 24 }} />
        </View>
      </KeyboardAwareScrollView>
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
  card: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    backgroundColor: "transparent",
  },
  cardInner: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  heading: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    color: "#111827",
  },
  subLabel: { fontWeight: "700", color: "#111827", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#F9FAFB",
    marginBottom: 12,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  btn: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  btnDisabled: { backgroundColor: "#9CA3AF" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  cardTitle: { fontWeight: "700", color: "#111827" },
  removeBtn: {
    borderWidth: 1,
    borderColor: "#EF4444",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  removeBtnText: { color: "#EF4444", fontWeight: "700", fontSize: 12 },
  addBtn: {
    borderWidth: 1,
    borderColor: "#111827",
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  addBtnText: { color: "#FFFFFF", fontWeight: "700" },
  medRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFF",
    color: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    fontWeight: "700",
  },
  chipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
    color: "#FFFFFF",
  },
  smallBtn: {
    borderWidth: 1,
    borderColor: "#EF4444",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "center",
  },
  smallBtnText: { color: "#EF4444", fontWeight: "700", fontSize: 12 },

  checkPill: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  checkPillOn: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  checkPillText: {
    color: "#111827",
    fontWeight: "700",
  },
  checkPillTextOn: {
    color: "#FFFFFF",
  },
});
