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
  const { t, i18n } = useTranslation();


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
                placeholder={t("elderlyOnboarding.ecEmailPH")}
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF2",
    backgroundColor: "#FFFFFF",
    padding: 18,
    shadowColor: "#021627",
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  heading: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 10,
    color: "#0F1724",
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 8,
    color: "#0F1724",
  },
  input: {
    borderWidth: 1,
    borderColor: "#E6EDF5",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: "#0F1724",
    backgroundColor: "#FBFDFF",
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
  btn: {
    backgroundColor: "#0F1724",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 14,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  btnDisabled: { backgroundColor: "#9CA3AF" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
