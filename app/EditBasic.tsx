import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useAuth } from "../src/auth/AuthProvider";
import TopBar, { LangCode } from "../src/components/TopBar";
import { supabase } from "../src/lib/supabase";

export default function EditBasic() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { session, saveElderlyProfile } = useAuth();

  const HEADER_HEIGHT = 56;
  const keyboardOffset = HEADER_HEIGHT + insets.top;

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

  // Language switch for TopBar
  const setLanguage = async (code: LangCode) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  // Prefill from Supabase
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
        t("elderlyOnboarding.saveErrorTitle") || "Error",
        t("elderlyOnboarding.saveErrorMsg") || "Could not save profile."
      );
    }

    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF" }}>
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={setLanguage}
        title={t("profile.editBasic")}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={keyboardOffset}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.container}>
              <Text style={s.heading}>{t("profile.editBasic")}</Text>

              <TextInput
                placeholder={t("elderlyOnboarding.namePH")}
                placeholderTextColor="#9CA3AF"
                value={name}
                onChangeText={setName}
                style={s.input}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => yobRef.current?.focus()}
              />

              <TextInput
                ref={yobRef}
                placeholder={t("elderlyOnboarding.yobPH")}
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={4}
                value={yob}
                onChangeText={setYob}
                style={s.input}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => ecNameRef.current?.focus()}
              />

              <Text style={s.label}>{t("elderlyOnboarding.genderLabel")}</Text>
              <View style={s.chipsRow}>
                {[
                  { label: t("elderlyOnboarding.male"), value: "male" },
                  { label: t("elderlyOnboarding.female"), value: "female" },
                  { label: t("elderlyOnboarding.na"), value: "na" },
                ].map((opt) => {
                  const active = gender === (opt.value as any);
                  return (
                    <Text
                      key={opt.value}
                      onPress={() => setGender(opt.value as any)}
                      style={[s.chip, active && s.chipActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      {opt.label}
                    </Text>
                  );
                })}
              </View>

              <Text style={s.sectionHeading}>
                {t("elderlyOnboarding.emergencySectionTitle")}
              </Text>
              <TextInput
                ref={ecNameRef}
                placeholder={t("elderlyOnboarding.ecNamePH")}
                placeholderTextColor="#9CA3AF"
                value={ecName}
                onChangeText={setEcName}
                style={s.input}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => ecRelationRef.current?.focus()}
              />
              <TextInput
                ref={ecRelationRef}
                placeholder={t("elderlyOnboarding.ecRelationPH")}
                placeholderTextColor="#9CA3AF"
                value={ecRelation}
                onChangeText={setEcRelation}
                style={s.input}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => ecPhoneRef.current?.focus()}
              />
              <TextInput
                ref={ecPhoneRef}
                placeholder={t("elderlyOnboarding.ecPhonePH")}
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                value={ecPhone}
                onChangeText={setEcPhone}
                style={s.input}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => ecEmailRef.current?.focus()}
              />
              <TextInput
                ref={ecEmailRef}
                placeholder={
                  t("elderlyOnboarding.ecEmailPH") ||
                  "Emergency contact email (optional)"
                }
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                value={ecEmail}
                onChangeText={setEcEmail}
                style={s.input}
                returnKeyType="done"
              />

              <View style={{ height: 8 }} />

              <Pressable
                onPress={onSave}
                disabled={!canSubmit}
                style={[s.btn, !canSubmit && s.btnDisabled]}
              >
                <Text style={s.btnText}>{t("common.save") || "Save"}</Text>
              </Pressable>

              <Pressable onPress={() => router.back()} style={s.btnGhost}>
                <Text style={s.btnGhostText}>
                  {t("common.cancel") || "Cancel"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, backgroundColor: "#fff" },
  heading: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  sectionHeading: { fontSize: 16, fontWeight: "700", marginTop: 8 },
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
  label: { marginTop: 6, marginBottom: 6, fontWeight: "700", color: "#111827" },
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
  btn: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  btnDisabled: { backgroundColor: "#9CA3AF" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  btnGhost: { alignItems: "center", paddingVertical: 12 },
  btnGhostText: { color: "#111827", fontWeight: "800" },
});
