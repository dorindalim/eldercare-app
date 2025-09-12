// app/Onboarding/ElderlyBasics.tsx
import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthProvider";

export default function ElderlyBasics() {
  const router = useRouter();
  const { saveElderlyProfile, session } = useAuth();
  const { t } = useTranslation();

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

  const onSubmit = async () => {
    if (!canSubmit || !session) {
      return Alert.alert(t("elderlyOnboarding.alertIncompleteTitle"));
    }

    const result = await saveElderlyProfile({
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

    if (!result?.success) {
      return Alert.alert(
        t("elderlyOnboarding.saveErrorTitle"),
        t("elderlyOnboarding.saveErrorMsg")
      );
    }

    router.replace("/Onboarding/ElderlyConditions");
  };

  return (
    <SafeAreaView style={s.safe} edges={["left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.card}>
              <Text style={s.heading}>{t("elderlyOnboarding.title")}</Text>

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
                    <Pressable
                      key={opt.value}
                      onPress={() => setGender(opt.value as any)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[s.chip, active && s.chipActive]}>
                        {opt.label}
                      </Text>
                    </Pressable>
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
                onSubmitEditing={Keyboard.dismiss}
              />

              <View style={{ height: 8 }} />

              <Pressable
                onPress={onSubmit}
                disabled={!canSubmit}
                style={[s.btn, !canSubmit && s.btnDisabled]}
              >
                <Text style={s.btnText}>{t("elderlyOnboarding.finish")}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
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
    maxWidth: 520,
    alignSelf: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    padding: 16,
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
  sectionHeading: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 8,
    color: "#111827",
  },
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
});
