import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../src/auth/AuthProvider";
import OffsetButton from "../src/components/OffsetButton";
import TopBar, { type LangCode } from "../src/components/TopBar";
import { supabase } from "../src/lib/supabase";

const BUTTON_H = 57;

function ReqLabel({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, marginBottom: 6 }}>
      <Text style={s.label}>{text}</Text>
      <Text style={s.star}> *</Text>
    </View>
  );
}

export default function EditBasic() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { session, saveElderlyProfile } = useAuth();

  const [name, setName] = useState("");
  const [yob, setYob] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "na" | "">("");
  const [ecName, setEcName] = useState("");
  const [ecRelation, setEcRelation] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [ecEmail, setEcEmail] = useState("");

  const yobRef = useRef<TextInput>(null);
  const ecNameRef = useRef<TextInput>(null);
  const ecRelationRef = useRef<TextInput>(null);
  const ecPhoneRef = useRef<TextInput>(null);
  const ecEmailRef = useRef<TextInput>(null);

  const setLanguage = async (code: LangCode) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  useEffect(() => {
    if (!session?.userId) return;
    (async () => {
      const { data: prof } = await supabase
        .from("elderly_profiles")
        .select(
          "name, year_of_birth, gender, emergency_name, emergency_relation, emergency_phone, emergency_email"
        )
        .eq("user_id", session.userId)
        .maybeSingle();

      if (prof) {
        setName(prof.name ?? "");
        setYob(prof.year_of_birth ? String(prof.year_of_birth) : "");
        setGender((prof.gender as any) || "");
        setEcName(prof.emergency_name ?? "");
        setEcRelation(prof.emergency_relation ?? "");
        setEcPhone(prof.emergency_phone ?? "");
        setEcEmail(prof.emergency_email ?? "");
      }
    })();
  }, [session?.userId]);

  const canSubmit = useMemo(
    () =>
      !!(
        name.trim() &&
        yob.trim().length === 4 &&
        gender &&
        ecName.trim() &&
        ecRelation.trim() &&
        ecPhone.trim()
      ),
    [name, yob, gender, ecName, ecRelation, ecPhone]
  );

  const onSave = async () => {
    if (!session) {
      return Alert.alert(t("common.notLoggedIn"), t("common.pleaseLoginAgain"));
    }
    if (!canSubmit) {
      return Alert.alert(t("elderlyOnboarding.alertIncompleteTitle"));
    }

    const res = await saveElderlyProfile({
      name: name.trim(),
      year_of_birth: yob.trim(),
      gender: gender as any,
      phone: session.phone,
      emergency_contact: {
        name: ecName.trim(),
        relation: ecRelation.trim(),
        phone: ecPhone.trim(),
        email: ecEmail.trim() || undefined,
      },
    });

    if (!res.success) {
      return Alert.alert(
        t("elderlyOnboarding.saveErrorTitle"),
        t("elderlyOnboarding.saveErrorMsg")
      );
    }

    router.back();
  };

  return (
    <SafeAreaView style={s.safe} edges={["left", "right"]}>
      <TopBar
        leftMode="back"
        backTo="/tabs/Profile"
        language={i18n.language as LangCode}
        setLanguage={setLanguage}
        title={t("profile.editBasic")}
        bgColor="#FFFAF0"
        includeTopInset
        barHeight={44}
        topPadding={2}
      />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: Math.max(insets.bottom + 16, 28) }]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.form}>
            {/* Hero/title note like Basics (optional) */}
            {/* <Text style={s.heroTitle}>{t("elderlyOnboarding.hero")}</Text> */}
            <Text style={s.reqNote}>{t("common.requiredNote")}</Text>

            <ReqLabel text={t("elderlyOnboarding.namePH")} />
            <TextInput
              value={name}
              onChangeText={setName}
              style={s.input}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => yobRef.current?.focus()}
            />

            <ReqLabel text={t("elderlyOnboarding.yobPH")} />
            <TextInput
              ref={yobRef}
              keyboardType="number-pad"
              maxLength={4}
              value={yob}
              onChangeText={setYob}
              style={s.input}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => ecNameRef.current?.focus()}
            />

            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, marginBottom: 6 }}>
              <Text style={s.label}>{t("elderlyOnboarding.genderLabel")}</Text>
              <Text style={s.star}> *</Text>
            </View>

            <View style={s.chipsRow}>
              {[
                { label: t("elderlyOnboarding.male"), value: "male" },
                { label: t("elderlyOnboarding.female"), value: "female" },
                { label: t("elderlyOnboarding.na"), value: "na" },
              ].map((opt) => {
                const active = gender === (opt.value as any);
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setGender(opt.value as any)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[s.chip, active && s.chipActive]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={s.sectionHeading}>
              {t("elderlyOnboarding.emergencySectionTitle")}
            </Text>

            <ReqLabel text={t("elderlyOnboarding.ecNamePH")} />
            <TextInput
              ref={ecNameRef}
              value={ecName}
              onChangeText={setEcName}
              style={s.input}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => ecRelationRef.current?.focus()}
            />

            <ReqLabel text={t("elderlyOnboarding.ecRelationPH")} />
            <TextInput
              ref={ecRelationRef}
              value={ecRelation}
              onChangeText={setEcRelation}
              style={s.input}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => ecPhoneRef.current?.focus()}
            />

            <ReqLabel text={t("elderlyOnboarding.ecPhonePH")} />
            <TextInput
              ref={ecPhoneRef}
              keyboardType="phone-pad"
              value={ecPhone}
              onChangeText={setEcPhone}
              style={s.input}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => ecEmailRef.current?.focus()}
            />

            <Text style={s.label}>
              {t("elderlyOnboarding.ecEmailPH")}
            </Text>
            <TextInput
              ref={ecEmailRef}
              keyboardType="email-address"
              autoCapitalize="none"
              value={ecEmail}
              onChangeText={setEcEmail}
              style={s.input}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />

            <View style={{ height: 8 }} />

            {/* Save */}
            <OffsetButton
              label={t("common.save") || "Save"}
              onPress={onSave}
              disabled={!canSubmit}
              height={BUTTON_H}
              radius={12}
              bgColor="#FED787"
              borderColor="#1F2937"
              borderColorActive="#000"
              textColor="#1F2937"
              textColorActive="#0B1220"
              offsetBgColor="#FFFAF0"
              offsetStrokeColor="#000"
              offsetLeft={4}
              offsetTop={3}
              offsetRight={-6}
              offsetBottom={-6}
              style={{ marginTop: 12 }}
            />

            {/* Cancel */}
            <OffsetButton
              label={t("common.cancel") || "Cancel"}
              onPress={() => router.back()}
              height={BUTTON_H}
              radius={12}
              bgColor="#FFFFFF"
              borderColor="#1F2937"
              borderColorActive="#000"
              textColor="#111827"
              textColorActive="#0B1220"
              offsetBgColor="#CFADE8"
              offsetStrokeColor="#000"
              offsetLeft={4}
              offsetTop={3}
              offsetRight={-6}
              offsetBottom={-6}
              style={{ marginTop: 10 }}
            />
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFAF0" },

  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 8, backgroundColor: "transparent" },

  form: { flex: 1, width: "100%", alignSelf: "center", maxWidth: 640 },

  heroTitle: { fontSize: 24, fontWeight: "900", color: "#111827", marginTop: 6, marginBottom: 10 },

  sectionHeading: { fontSize: 18, fontWeight: "700", marginTop: 12, marginBottom: 6, color: "#111827" },

  label: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 4 },
  star: { color: "#B91C1C", fontWeight: "900" },
  reqNote: { color: "#6B7280", marginBottom: 8 },

  input: {
    width: "100%",
    borderWidth: 2,
    borderColor: "#1F2937",
    paddingHorizontal: 14,
    height: BUTTON_H,
    borderRadius: 8,
    backgroundColor: "#FFF",
    color: "#111827",
    marginBottom: 10,
    fontSize: 16,
  },

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
  chipActive: {
    backgroundColor: "#0F1724",
    borderColor: "#0F1724",
    color: "#FFFFFF",
  },
});
