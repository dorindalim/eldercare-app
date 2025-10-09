import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import AuthTopBar, { LangCode } from "../../src/components/AuthTopBar";
import Screen from "../../src/components/Screen";
import { supabase } from "../../src/lib/supabase";

export default function Restore() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  const setLanguage = async (code: LangCode) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  const onRestore = async () => {
    if (!token.trim()) return Alert.alert(t("common.ok"), t("auth.restore.title"));
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("account_deletion_requests")
        .select("id, user_id, status, scheduled_for")
        .eq("restore_token", token.trim())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn("restore lookup error", error.message);
        return Alert.alert(t("auth.restore.errorTitle"), error.message || t("auth.restore.lookupFailed"));
      }

      if (!data) {
        return Alert.alert(t("auth.restore.notFoundTitle"), t("auth.restore.notFoundBody"));
      }

      if (data.status === "scheduled") {
        const { error: cancelErr } = await supabase
          .from("account_deletion_requests")
          .update({ status: "cancelled" })
          .eq("id", data.id);

        if (cancelErr) {
          console.warn("restore cancel error", cancelErr.message);
          return Alert.alert(t("auth.restore.errorTitle"), cancelErr.message || t("auth.restore.restoreFailed"));
        }

        Alert.alert(t("auth.restore.restoredTitle"), t("auth.restore.restoredBody"));
        router.replace("/Authentication/LogIn");
      } else if (data.status === "pending" || data.status === "verified") {
        Alert.alert(t("auth.restore.tooEarlyTitle"), t("auth.restore.tooEarlyBody"));
      } else {
        Alert.alert(t("auth.restore.cannotRestoreTitle"), t("auth.restore.cannotRestoreBody"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      topBar={<AuthTopBar language={i18n.language as LangCode} setLanguage={setLanguage} />}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={s.card}>
          <Text style={s.title}>{t("auth.restore.title")}</Text>
          <Text style={s.sub}>{t("auth.restore.subtitle")}</Text>

          <Text style={s.label}>{t("auth.restore.codeLabel")}</Text>
          <TextInput
            placeholder={t("auth.restore.codePH")}
            value={token}
            onChangeText={setToken}
            style={s.input}
            autoCapitalize="none"
          />

          <Pressable onPress={onRestore} style={s.btn} disabled={loading}>
            <Text style={s.btnText}>{loading ? t("auth.restore.restoring") : t("auth.restore.restoreBtn")}</Text>
          </Pressable>

          <View style={s.footerRow}>
            <Text style={s.footerText}>{t("auth.restore.backTo")}</Text>
            <Link href="/Authentication/LogIn" asChild>
              <Pressable>
                <Text style={s.link}>{t("auth.restore.logIn")}</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { marginTop: 12, paddingHorizontal: 20 },
  title: { fontSize: 24, fontWeight: "800", color: "#111827" },
  sub: { marginTop: 4, marginBottom: 16, color: "#6B7280" },
  label: { fontWeight: "700", color: "#111827", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#D0D5DD",
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#FFF",
    color: "#111827",
    marginBottom: 12,
  },
  btn: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 6,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: 16 },
  footerText: { color: "#6B7280" },
  link: { color: "#111827", fontWeight: "800" },
});
