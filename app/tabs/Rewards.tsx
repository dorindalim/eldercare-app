import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import i18n from "../../i18n";
import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import TopBar, { LangCode } from "../../src/components/TopBar";

import { router } from "expo-router";
import { useCheckins } from "../../src/hooks/useCheckIns";
import { supabase } from "../../src/lib/supabase";

type RewardItem = {
  id: string;
  titleKey: string;
  descKey: string;
  termsKey: string;
  cost: number;
  icon?: keyof typeof Ionicons.glyphMap;
};

type OwnedVoucher = {
  id: string;
  rewardId: string;
  code: string;
  redeemedAt: string;
};

const genCode = () =>
  `EC-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

export default function RewardsScreen() {
  const { t } = useTranslation();
  const { session, logout } = useAuth();
  const userId = session?.userId ?? "local";
  const { coins = 0, refresh: refreshCheckins } = useCheckins(session?.userId);

  const OWNED_KEY = `rewards_owned_${userId}_v1`;
  const [owned, setOwned] = useState<OwnedVoucher[]>([]);
  const [termsOpen, setTermsOpen] = useState<null | RewardItem>(null);

  useEffect(() => {
    refreshCheckins();
  }, [refreshCheckins]);

  useEffect(() => {
    if (!session?.userId) return;
    const ch = supabase
      .channel(`rewards:${session.userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "elderly_profiles",
          filter: `user_id=eq.${session.userId}`,
        },
        () => refreshCheckins()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [session?.userId, refreshCheckins]);

  const catalog: RewardItem[] = useMemo(
    () => [
      {
        id: "ntuc5",
        titleKey: "rewards.items.ntuc5.title",
        descKey: "rewards.items.ntuc5.desc",
        termsKey: "rewards.items.ntuc5.terms",
        cost: 10,
        icon: "cart-outline",
      },
      {
        id: "ntuc10",
        titleKey: "rewards.items.ntuc10.title",
        descKey: "rewards.items.ntuc10.desc",
        termsKey: "rewards.items.ntuc10.terms",
        cost: 18,
        icon: "cart-outline",
      },
      {
        id: "kopitiam5",
        titleKey: "rewards.items.kopitiam5.title",
        descKey: "rewards.items.kopitiam5.desc",
        termsKey: "rewards.items.kopitiam5.terms",
        cost: 9,
        icon: "cafe-outline",
      },
      {
        id: "guardian5",
        titleKey: "rewards.items.guardian5.title",
        descKey: "rewards.items.guardian5.desc",
        termsKey: "rewards.items.guardian5.terms",
        cost: 9,
        icon: "medkit-outline",
      },
    ],
    []
  );

  // Load owned vouchers (local list)
  useEffect(() => {
    (async () => {
      try {
        const raw = (await AsyncStorage.getItem(OWNED_KEY)) || "[]";
        const list: OwnedVoucher[] = JSON.parse(raw);
        setOwned(list);
      } catch {
        setOwned([]);
      }
    })();
  }, [OWNED_KEY]);

  const persistOwned = useCallback(
    async (list: OwnedVoucher[]) => {
      setOwned(list);
      await AsyncStorage.setItem(OWNED_KEY, JSON.stringify(list));
    },
    [OWNED_KEY]
  );

  // Deduct coins in elderly_profiles, then refresh
  const spendCoins = useCallback(
    async (amount: number) => {
      if (!session?.userId) return false;

      // fetch latest balance from DB to avoid stale value
      const { data: row, error: e1 } = await supabase
        .from("elderly_profiles")
        .select("coins")
        .eq("user_id", session.userId)
        .maybeSingle();

      if (e1 || !row) return false;

      const current = Number(row.coins ?? 0);
      if (current < amount) return false;

      const { error: e2 } = await supabase
        .from("elderly_profiles")
        .update({ coins: current - amount })
        .eq("user_id", session.userId);

      if (e2) return false;

      await refreshCheckins();
      return true;
    },
    [session?.userId, refreshCheckins]
  );

  const onRedeem = useCallback(
    (item: RewardItem) => {
      if (coins < item.cost) {
        Alert.alert(t("rewards.notEnoughTitle"), t("rewards.notEnoughBody"));
        return;
      }
      Alert.alert(
        t("rewards.confirmTitle"),
        t("rewards.confirmBody", { cost: item.cost, name: t(item.titleKey) }),
        [
          { text: t("rewards.cancel"), style: "cancel" },
          {
            text: t("rewards.confirm"),
            style: "destructive",
            onPress: async () => {
              const ok = await spendCoins(item.cost);
              if (!ok) {
                Alert.alert(t("rewards.failed"), t("rewards.tryAgain"));
                return;
              }
              const v: OwnedVoucher = {
                id: `${item.id}-${Date.now()}`,
                rewardId: item.id,
                code: genCode(),
                redeemedAt: new Date().toISOString(),
              };
              await persistOwned([v, ...owned]);
              Alert.alert(
                t("rewards.successTitle"),
                t("rewards.successBody", { code: v.code })
              );
            },
          },
        ]
      );
    },
    [coins, owned, persistOwned, spendCoins, t]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["left", "right"]}>
      <TopBar
        title={t("rewards.title")}
        language={i18n.language as LangCode}
        setLanguage={(lng: LangCode) => i18n.changeLanguage(lng)}
        bgColor="#D2AB80"
        includeTopInset={true}
        barHeight={44}
        topPadding={2}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/LogIn");
        }}
      />

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Balance */}
        <View style={s.card}>
          <View style={s.rowBetween}>
            <AppText variant="h2" weight="800">
              {t("rewards.balance")}
            </AppText>
            <View style={s.balancePill}>
              <Ionicons name="logo-usd" size={18} color="#111827" />
              <AppText weight="800" style={{ marginLeft: 6 }}>
                {coins} {coins === 1 ? t("rewards.coin") : t("rewards.coins")}
              </AppText>
            </View>
          </View>
        </View>

        {/* Catalog */}
        <View style={s.card}>
          <AppText variant="h2" weight="800" style={{ marginBottom: 6 }}>
            {t("rewards.catalogTitle")}
          </AppText>

          {catalog.map((item) => (
            <View key={item.id} style={s.rewardRow}>
              <View style={s.rewardIcon}>
                <Ionicons
                  name={item.icon || "gift-outline"}
                  size={22}
                  color="#111827"
                />
              </View>

              <View style={{ flex: 1 }}>
                <AppText weight="800">{t(item.titleKey)}</AppText>
                <AppText color="#6B7280">{t(item.descKey)}</AppText>
                <AppText weight="800" style={{ marginTop: 4 }}>
                  {t("rewards.cost", { count: item.cost })}
                </AppText>

                <View style={s.actionsRow}>
                  <Pressable
                    onPress={() => setTermsOpen(item)}
                    style={s.linkBtn}
                  >
                    <AppText weight="800" color="#111827">
                      {t("rewards.viewTerms")}
                    </AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => onRedeem(item)}
                    style={[
                      s.redeemBtn,
                      coins < item.cost && s.redeemBtnDisabled,
                    ]}
                    disabled={coins < item.cost}
                  >
                    <AppText color="#FFF" weight="800">
                      {t("rewards.redeem")}
                    </AppText>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Owned */}
        <View style={s.card}>
          <AppText variant="h2" weight="800" style={{ marginBottom: 6 }}>
            {t("rewards.ownedTitle")}
          </AppText>

          {owned.length === 0 ? (
            <AppText color="#6B7280">{t("rewards.noneOwned")}</AppText>
          ) : (
            owned.map((v) => {
              const def = catalog.find((c) => c.id === v.rewardId);
              return (
                <View key={v.id} style={s.voucherRow}>
                  <View style={{ flex: 1 }}>
                    <AppText weight="800">
                      {def ? t(def.titleKey) : t("rewards.voucher")}
                    </AppText>
                    <AppText color="#6B7280">
                      {t("rewards.code")}: {v.code}
                    </AppText>
                    <AppText color="#6B7280">
                      {t("rewards.redeemedAt")}{" "}
                      {new Date(v.redeemedAt).toLocaleString()}
                    </AppText>
                  </View>
                  {def && (
                    <Pressable
                      onPress={() => setTermsOpen(def)}
                      style={s.linkBtn}
                    >
                      <AppText weight="800" color="#111827">
                        {t("rewards.howToUse")}
                      </AppText>
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Terms modal */}
      <Modal
        visible={!!termsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTermsOpen(null)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <AppText variant="h2" weight="800">
              {termsOpen ? t(termsOpen.titleKey) : ""}
            </AppText>
            <ScrollView style={{ maxHeight: 320, marginTop: 8 }}>
              <AppText>{termsOpen ? t(termsOpen.termsKey) : ""}</AppText>
            </ScrollView>
            <Pressable style={s.closeBtn} onPress={() => setTermsOpen(null)}>
              <AppText color="#FFF" weight="800">
                {t("rewards.close")}
              </AppText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 24 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 12,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balancePill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  rewardRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  rewardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  linkBtn: {
    borderWidth: 1,
    borderColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#FFF",
  },
  redeemBtn: {
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  redeemBtnDisabled: { opacity: 0.4 },
  voucherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#FFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
  },
  closeBtn: {
    alignSelf: "flex-end",
    marginTop: 12,
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
