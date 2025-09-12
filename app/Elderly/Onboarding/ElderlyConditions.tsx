import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useAuth } from "../../../src/auth/AuthProvider";

type Med = { name: string; frequency: string };
type ConditionCard = {
  condition: string;
  doctor: string;
  clinic: string;
  appointments: string;
  meds: Med[];
};

const ASSISTIVE_OPTIONS = [
  { key: "walking_cane", labelKey: "elderlyConditions.assistive.walking_cane" },
  { key: "wheelchair", labelKey: "elderlyConditions.assistive.wheelchair" },
  { key: "hearing_aid", labelKey: "elderlyConditions.assistive.hearing_aid" },
  { key: "glasses", labelKey: "elderlyConditions.assistive.glasses" },
  { key: "other", labelKey: "elderlyConditions.assistive.other" },
];

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
    },
  ]);

  const [assistive, setAssistive] = useState<string[]>([]);
  const [assistiveOther, setAssistiveOther] = useState("");
  const [drugAllergies, setDrugAllergies] = useState("");
  const [publicNote, setPublicNote] = useState("");

  const canSubmit = useMemo(() => {
    const anyCondFilled = conditions.some(
      (c) =>
        c.condition.trim() ||
        c.doctor.trim() ||
        c.clinic.trim() ||
        c.appointments.trim() ||
        c.meds.some((m) => m.name.trim())
    );
    const anyExtras =
      assistive.length > 0 ||
      !!assistiveOther.trim() ||
      !!drugAllergies.trim() ||
      !!publicNote.trim();
    return anyCondFilled || anyExtras;
  }, [conditions, assistive, assistiveOther, drugAllergies, publicNote]);

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
      },
    ]);

  const removeCondition = (idx: number) =>
    setConditions((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
    );

  // meds
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
      return Alert.alert("Not logged in", "Please log in again.");
    }

    const cleanConds = conditions
      .map((c) => ({
        condition: c.condition.trim(),
        doctor: c.doctor.trim() || undefined,
        clinic: c.clinic.trim() || undefined,
        appointments: c.appointments.trim() || undefined,
        medications: c.meds
          .map((m) => ({
            name: m.name.trim(),
            frequency: m.frequency.trim() || undefined,
          }))
          .filter((m) => m.name),
      }))
      .filter(
        (c) =>
          c.condition ||
          (c.medications && c.medications.length) ||
          c.doctor ||
          c.clinic ||
          c.appointments
      );

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
    if (!res.success) {
      return Alert.alert("Error", "Failed to save. Please try again.");
    }

    await markOnboarding(true);
    router.replace("/Elderly/tabs/HomePage");
  };

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: "#fff" }}
      contentContainerStyle={s.body}
      enableOnAndroid
      enableAutomaticScroll
      extraScrollHeight={24}
      extraHeight={Platform.OS === "android" ? 120 : 0}
      keyboardOpeningTime={0}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.heading}>{t("elderlyConditions.title")}</Text>

      {conditions.map((c, idx) => (
        <View key={idx} style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>
              {t("elderlyConditions.conditionTitle", { index: idx + 1 })}
            </Text>
            <Pressable
              onPress={() => removeCondition(idx)}
              disabled={conditions.length === 1}
              style={[s.removeBtn, conditions.length === 1 && { opacity: 0.4 }]}
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
            returnKeyType="next"
          />

          <TextInput
            placeholder={t("elderlyConditions.doctorPH")}
            placeholderTextColor="#9CA3AF"
            value={c.doctor}
            onChangeText={(v) => setCond(idx, { doctor: v })}
            style={s.input}
            returnKeyType="next"
          />

          <TextInput
            placeholder={t("elderlyConditions.clinicPH")}
            placeholderTextColor="#9CA3AF"
            value={c.clinic}
            onChangeText={(v) => setCond(idx, { clinic: v })}
            style={s.input}
            returnKeyType="next"
          />

          <TextInput
            placeholder={t("elderlyConditions.appointmentsPH")}
            placeholderTextColor="#9CA3AF"
            value={c.appointments}
            onChangeText={(v) => setCond(idx, { appointments: v })}
            style={[s.input, s.multiline]}
            multiline
            blurOnSubmit
          />

          {/* Medications */}
          <Text style={s.subLabel}>{t("elderlyConditions.medsLabel")}</Text>
          {c.meds.map((m, mIdx) => (
            <View key={mIdx} style={s.medRow}>
              <TextInput
                placeholder={t("elderlyConditions.medNamePH")}
                placeholderTextColor="#9CA3AF"
                value={m.name}
                onChangeText={(v) => setMed(idx, mIdx, { name: v })}
                style={[s.input, { flex: 1, marginBottom: 0 }]}
                returnKeyType="next"
              />
              <View style={{ width: 8 }} />
              <TextInput
                placeholder={t("elderlyConditions.medFreqPH")}
                placeholderTextColor="#9CA3AF"
                value={m.frequency}
                onChangeText={(v) => setMed(idx, mIdx, { frequency: v })}
                style={[s.input, { flex: 1, marginBottom: 0 }]}
                returnKeyType="done"
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
            <Text style={s.addBtnText}>{t("elderlyConditions.addMed")}</Text>
          </Pressable>
        </View>
      ))}

      <Pressable onPress={addCondition} style={s.addBtn}>
        <Text style={s.addBtnText}>{t("elderlyConditions.addCondition")}</Text>
      </Pressable>

      {/* Assistive devices */}
      <Text style={[s.heading, { marginTop: 8 }]}>
        {t("elderlyConditions.assistive.label")}
      </Text>
      <View style={s.chipsRow}>
        {ASSISTIVE_OPTIONS.map((opt) => {
          const active = assistive.includes(opt.key);
          return (
            <Text
              key={opt.key}
              onPress={() => toggleAssistive(opt.key)}
              style={[s.chip, active && s.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              {t(opt.labelKey)}
            </Text>
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

      {/* Drug allergies */}
      <TextInput
        placeholder={t("elderlyConditions.drugAllergiesPH")}
        placeholderTextColor="#9CA3AF"
        value={drugAllergies}
        onChangeText={setDrugAllergies}
        style={[s.input, s.multiline]}
        multiline
        blurOnSubmit
      />

      {/* Public note */}
      <TextInput
        placeholder={t("elderlyConditions.publicNotePH")}
        placeholderTextColor="#9CA3AF"
        value={publicNote}
        onChangeText={setPublicNote}
        style={[s.input, s.multiline]}
        multiline
        blurOnSubmit
      />

      <Pressable
        onPress={onSubmit}
        disabled={!canSubmit}
        style={[s.btn, !canSubmit && s.btnDisabled]}
      >
        <Text style={s.btnText}>{t("elderlyConditions.finish")}</Text>
      </Pressable>

      <View style={{ height: 24 }} />
    </KeyboardAwareScrollView>
  );
}

const s = StyleSheet.create({
  body: { padding: 24, gap: 12, backgroundColor: "#fff" },
  heading: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
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
  card: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
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
  smallBtnText: {
    color: "#EF4444",
    fontWeight: "700",
    fontSize: 12,
  },
});
