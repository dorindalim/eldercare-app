// app/Onboarding/ElderlyBasics.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthProvider";
import AuthTopBar from "../../src/components/AuthTopBar";
import OffsetButton from "../../src/components/OffsetButton";
import { KDRAFT, useCombinedProgress } from "../../src/lib/progress";

const BG = require("../../assets/photos/screens/MediumBlob.png");

const SIDE = 16;       
const MAXW = 640;      
const INSET = 12;       

const BUTTON_H = 57;
const BAR_PAD = 8;

type LangCode = "en" | "zh" | "ms" | "ta";
const short = (c: string) => (c === "en" ? "EN" : c === "zh" ? "中文" : c === "ms" ? "BM" : "தமிழ்");

export default function ElderlyBasics() {
  const router = useRouter();
  const { saveElderlyProfile, session } = useAuth();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [yob, setYob] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "na" | "">("");
  const [ecName, setEcName] = useState("");
  const [ecRelation, setEcRelation] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [ecEmail, setEcEmail] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KDRAFT.basics);
        if (raw) {
          const d = JSON.parse(raw);
          setName(d.name ?? "");
          setYob(d.yob ?? "");
          setGender(d.gender ?? "");
          setEcName(d.ecName ?? "");
          setEcRelation(d.ecRelation ?? "");
          setEcPhone(d.ecPhone ?? "");
          setEcEmail(d.ecEmail ?? "");
        }
      } catch {}
    })();
  }, []);

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

  const basicsProgress = useMemo(() => {
    const bits = [
      !!name.trim(),
      yob.trim().length === 4,
      !!gender,
      !!ecName.trim(),
      !!ecRelation.trim(),
      !!ecPhone.trim(),
    ];
    return bits.filter(Boolean).length / bits.length;
  }, [name, yob, gender, ecName, ecRelation, ecPhone]);

  const combined = useCombinedProgress("basics", basicsProgress);

  const saveDraft = async () => {
    const draft = { name, yob, gender, ecName, ecRelation, ecPhone, ecEmail };
    await AsyncStorage.setItem(KDRAFT.basics, JSON.stringify(draft));
    Alert.alert(t("common.save"), t("elderlyOnboarding.draftSaved") || "Saved as draft.");
  };

  const onSubmit = async () => {
    if (!canSubmit || !session) {
      return Alert.alert(t("elderlyOnboarding.alertIncompleteTitle"));
    }

    await AsyncStorage.setItem(
      KDRAFT.basics,
      JSON.stringify({ name, yob, gender, ecName, ecRelation, ecPhone, ecEmail })
    );

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
      return Alert.alert(t("elderlyOnboarding.saveErrorTitle"), t("elderlyOnboarding.saveErrorMsg"));
    }

    router.replace("/Onboarding/ElderlyConditions");
  };

  const extraBottomSpace = insets.bottom + BUTTON_H + BAR_PAD * 2 + 18;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent barStyle="dark-content" backgroundColor="transparent" />
      <ImageBackground source={BG} style={s.bg} resizeMode="cover">
        <SafeAreaView style={s.safe}>
          {/* Top bar */}
          <AuthTopBar
            maxWidth={MAXW}
            horizontalPadding={INSET}
            leftAccessory={<View style={{ width: 24, height: 24 }} />}
            langShort={short(i18n.language)}
            style={{ marginBottom: 0 }}
            onOpenLanguage={async () => {
              const order: LangCode[] = ["en", "zh", "ms", "ta"];
              const next = order[(order.indexOf(i18n.language as LangCode) + 1) % order.length];
              await i18n.changeLanguage(next);
              await AsyncStorage.setItem("lang", next);
            }}
            progress={combined}
          />

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={insets.top + 4}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <ScrollView
                contentContainerStyle={[s.scrollTop, { paddingBottom: extraBottomSpace }]}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={s.formWrap}>
                  <Text style={s.heroTitle}>
                    {t("elderlyOnboarding.hero")}
                  </Text>

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
                          <Text style={[s.chip, active && s.chipActive]}>{opt.label}</Text>
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
                </View>
              </ScrollView>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>

          {/* Sticky footer */}
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
                  label={t("common.continue")}
                  onPress={onSubmit}
                  disabled={!canSubmit}
                  height={BUTTON_H}
                  radius={12}
                  style={{ flex: 1, marginLeft: 10, opacity: canSubmit ? 1 : 0.6 }}
                />
              </View>

              {/* <View style={s.homePill} /> */}
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

  scrollTop: { flexGrow: 1, paddingTop: 2 },

  formWrap: {
    alignSelf: "center",
    width: "100%",
    maxWidth: MAXW,
    paddingHorizontal: INSET,
  },

  heroTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111827",
    marginTop: 10,
    marginBottom: 50,
  },

  sectionHeading: { fontSize: 16, fontWeight: "700", marginTop: 8, marginBottom: 16, color: "#0F1724" },
  label: { marginTop: 6, marginBottom: 6, fontWeight: "700", color: "#111827" },

  input: {
    borderWidth: 2,
    borderColor: "#1F2937",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 0,
    height: 57,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#ffffffff",
    marginBottom: 12,
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
  chipActive: { backgroundColor: "#0F1724", borderColor: "#0F1724", color: "#FFFFFF" },

  footerOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#CFADE8",
    paddingTop: BAR_PAD,
    paddingHorizontal: SIDE,
  },
  footerEdge: {
    position: "absolute", 
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#111827",
  },
  footerRowWrap: {
    paddingTop: BAR_PAD,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  homePill: {
    alignSelf: "center",
    marginTop: 10,
    width: 140,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#111827",
    marginBottom: 4,
  },
});
