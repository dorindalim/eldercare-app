import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ImageBackground,
  Platform,
  Pressable,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthProvider";
import AuthTopBar, { type LangCode } from "../../src/components/AuthTopBar";
import OffsetButton from "../../src/components/OffsetButton";
import { supabase } from "../../src/lib/supabase";

const BG = require("../../assets/photos/screens/Success.png");
const PORTAL_BASE_URL = "https://dorindalim.github.io/eldercare-app/ECPortal.html";

const TOP_TITLE_OFFSET = 50;   
const INFO_RAISE = 150;        

export default function SuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { height: screenHeight } = useWindowDimensions();

  const [lang, setLang] = useState<LangCode>("en");
  useEffect(() => {
    (async () => {
      try {
        const saved = (await AsyncStorage.getItem("lang")) as LangCode | null;
        if (saved) setLang(saved);
      } catch {}
    })();
  }, []);
  const setLanguage = async (code: LangCode) => {
    setLang(code);
    await AsyncStorage.setItem("lang", code);
  };

  const getInfoBlockPosition = () => {
    if (screenHeight < 700) {
      return screenHeight * 0.65;
    } else if (screenHeight < 800) {
      return screenHeight * 0.7;
    } else {
      return screenHeight * 0.60;
    }
  };

  const onSharePortal = async () => {
    try {
      const userId = session?.userId;
      if (!userId) return alert("Please log in again.");

      const { data, error } = await supabase.rpc("ec_issue_link_if_ready_for", { p_user: userId });
      if (error) {
        console.warn("ec_issue_link_if_ready_for error:", error.message);
        return alert("Could not generate a portal link yet.");
      }

      const token =
        typeof data === "string" ? data : (data && typeof data === "object" && (data as any).token) || null;
      if (!token) return alert("Portal link is not ready yet.");

      const url = `${PORTAL_BASE_URL}?token=${encodeURIComponent(token)}`;

      await Share.share({
        message:
          `Hi! This is my Emergency Contact Portal:\n\n${url}\n\n` +
          `On first open, set a 4+ digit PIN. Use the same PIN next time to unlock.`,
        url,
        title: "Share EC Portal",
      });
    } catch (e: any) {
      console.warn("Share failed:", e?.message || e);
      alert("Sharing failed. Please try again.");
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent barStyle="dark-content" backgroundColor="transparent" />
      <ImageBackground source={BG} style={s.bg} resizeMode="cover">
        <SafeAreaView style={s.safe}>
          {/* Top bar: language chip only */}
          <AuthTopBar
            langShort={shortLabel(lang)}
            onOpenLanguage={async () => {
              const order: LangCode[] = ["en", "zh", "ms", "ta"];
              const next = order[(order.indexOf(lang) + 1) % order.length];
              await setLanguage(next);
            }}
            maxWidth={560}
            horizontalPadding={16}
          />

          <View style={[s.titleWrap, { marginTop: TOP_TITLE_OFFSET }]}>
            <Text style={s.title}>Success!</Text>
          </View>

          <View
            style={[
              s.bottomBlock,
              {
                top: getInfoBlockPosition(),
              }
            ]}
            pointerEvents="box-none"
          >
            <Text style={s.infoTitle}> What's next?</Text>
            <Text style={s.infoBody}>
              This EC Portal is a webpage that your emergency contacts can use to access your important
              information during emergencies. Share the link so they have quick access when needed.
            </Text>

            <Pressable
              onPress={onSharePortal}
              accessibilityRole="link"
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }, s.linkRow]}
              hitSlop={8}
            >
              <Text style={s.linkText}>Share EC Portal</Text>
              <Text style={s.linkIcon}>▶︎</Text>
            </Pressable>
          </View>

          {/* Sticky bottom CTA */}
          <View style={s.bottomBar}>
            <OffsetButton
              label="View Home"
              onPress={() => router.replace("/tabs/HomePage")}
              height={57}
              radius={14}
              bgColor="#FED787"
              style={{ width: "90%", maxWidth: 360 }}
            />
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

function shortLabel(code: LangCode) {
  return code === "en" ? "EN" : code === "zh" ? "中文" : code === "ms" ? "BM" : "தமிழ்";
}

const s = StyleSheet.create({
  bg: { flex: 1, width: "100%", height: "100%" },
  safe: { flex: 1, paddingHorizontal: 20 },

  titleWrap: { alignItems: "center" },
  title: {
    fontSize: 40,
    fontWeight: Platform.OS === "ios" ? ("900" as any) : "800",
    color: "#0F1724",
    letterSpacing: 0.2,
  },

  bottomBlock: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  infoTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0F1724",
    marginBottom: 6,
    textAlign: "center",
  },
  infoBody: {
    color: "#374151",
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 560,
  },

  linkRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  linkText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F1724",
    textDecorationLine: "underline",
  },
  linkIcon: { fontSize: 16, color: "#0F1724" },

  bottomBar: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 12,
  },
});
