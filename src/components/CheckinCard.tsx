import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type WeekCell = { date: string; checked: boolean };

type Props = {
  titleKey: string;
  hintKey: string;
  hintWhenCheckedKey: string;

  checked: boolean;
  onPress: () => void;

  weekChecks?: WeekCell[];
  coins?: number;
  onPressRewards?: () => void;
};

const DOW_LABEL: Record<number, string> = {
  0: "Su",
  1: "M",
  2: "T",
  3: "W",
  4: "Th",
  5: "F",
  6: "Sa",
};

export default function CheckinCard({
  titleKey,
  hintKey,
  hintWhenCheckedKey,
  checked,
  onPress,
  weekChecks = [],
  coins = 0,
  onPressRewards,
}: Props) {
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[s.checkCard, checked ? s.checkCardDone : s.checkCardNotDone]}
    >
      <Text style={s.checkTitle}>{t(titleKey)}</Text>

      <View style={s.doodle}>
        <Ionicons name="person-circle-outline" size={72} />
        {checked ? (
          <Ionicons
            name="checkmark-done-circle"
            size={88}
            color="#2e7d32"
            style={s.tick}
          />
        ) : (
          <Ionicons
            name="close-circle"
            size={88}
            color="#e53935"
            style={s.tick}
          />
        )}
      </View>

      <Text style={s.checkHint}>
        {checked ? t(hintWhenCheckedKey) : t(hintKey)}
      </Text>

      {/* Weekly tracker */}
      <View
        style={s.trackerWrap}
        accessible
        accessibilityLabel="Weekly check-in tracker"
      >
        {weekChecks.map((cell) => {
          const d = new Date(`${cell.date}T00:00:00`);
          const label = DOW_LABEL[d.getDay()];
          const isDone = !!cell.checked;

          return (
            <View
              key={cell.date}
              style={[s.dayBox, isDone ? s.dayBoxDone : s.dayBoxIdle]}
              accessibilityRole="image"
              accessibilityLabel={`${label} ${
                isDone ? "checked in" : "not checked in"
              }`}
            >
              <Text style={[s.dayText, isDone && s.dayTextDone]}>{label}</Text>
              {isDone && (
                <Ionicons
                  name="checkmark"
                  size={16}
                  style={s.dayTick}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              )}
            </View>
          );
        })}
      </View>

      <View style={s.rewardsRow}>
        <Pressable
          onPress={onPressRewards}
          accessibilityRole="button"
          style={s.rewardsBtn}
        >
          <Text style={s.rewardsBtnText}>{t("rewards.title")}</Text>
        </Pressable>

        <View
          style={s.coinsPill}
          accessibilityRole="text"
          accessibilityLabel={`${coins} ${
            coins === 1 ? t("rewards.coin") : t("rewards.coins")
          }`}
        >
          <Text style={s.coinsText}>
            {coins} {coins === 1 ? t("rewards.coin") : t("rewards.coins")}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  checkCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 18,
    borderWidth: 2,
    paddingVertical: 18,
    alignItems: "center",
    marginBottom: 14,
    paddingHorizontal: 14,
  },
  checkCardDone: { backgroundColor: "#EEF9F1", borderColor: "#66BB6A" },
  checkCardNotDone: { backgroundColor: "#FFF5F5", borderColor: "#EF9A9A" },

  checkTitle: { fontSize: 26, fontWeight: "800", marginBottom: 6 },

  doodle: {
    width: 160,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  tick: { position: "absolute", right: -6, bottom: -6 },

  checkHint: {
    marginTop: 6,
    fontSize: 13,
    color: "#4B5563",
    textAlign: "center",
    marginBottom: 10,
  },

  trackerWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  dayBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  dayBoxIdle: { backgroundColor: "#FFFFFF", borderColor: "#D1D5DB" },
  dayBoxDone: { backgroundColor: "#E8F5E9", borderColor: "#66BB6A" },
  dayText: { fontWeight: "800", color: "#111827", fontSize: 12 },
  dayTextDone: { color: "#1B5E20" },
  dayTick: { position: "absolute", right: -4, top: -6, color: "#2e7d32" },

  rewardsRow: {
    width: "100%",
    maxWidth: 520,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    paddingHorizontal: 4,
  },
  rewardsBtn: {
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  rewardsBtnText: { color: "#FFFFFF", fontWeight: "800" },

  coinsPill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  coinsText: { fontWeight: "800", color: "#111827" },
});
