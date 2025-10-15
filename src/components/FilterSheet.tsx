import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from "react-native";
import AppText from "./AppText";

import { Dimensions } from "react-native";
const screenHeight = Dimensions.get('window').height;

export type ChipOpt = { key: string; label: string };

type SectionBase = {
  id: string;
  title: string;
  style?: ViewStyle;
};

type ChipsMultiSection = SectionBase & {
  type: "chips-multi";
  options: ChipOpt[];
  selected: string[];
  onToggle: (key: string) => void;
};

type ChipsSingleSection = SectionBase & {
  type: "chips-single";
  options: ChipOpt[];
  selected: string | null;
  onSelect: (key: string) => void;
};

type ToggleSection = SectionBase & {
  type: "toggle";
  value: boolean;
  onChange: (v: boolean) => void;
};

type CustomSection = SectionBase & {
  type: "custom";
  render: () => React.ReactNode;
};

export type FilterSection =
  | ChipsMultiSection
  | ChipsSingleSection
  | ToggleSection
  | CustomSection;

type Props = {
  visible: boolean;
  onClose: () => void;
  sections: FilterSection[];
  onReset: () => void;
  onApply: () => void;
  title?: string;
  labels?: { reset?: string; apply?: string };
};

export default function FilterSheet({
  visible,
  onClose,
  sections,
  onReset,
  onApply,
  title = "Filters",
  labels = {},
}: Props) {
  const scrollViewRef = React.useRef<ScrollView>(null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.backdrop} />
      </TouchableWithoutFeedback>

      <View style={s.card}>
        <AppText variant="title" weight="900" style={{ marginBottom: 10 }}>
          {title}
        </AppText>

        <ScrollView 
          ref={scrollViewRef}
          style={s.scrollView}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled" // Add this
          keyboardDismissMode="on-drag" // Add this
        >
          {sections.map((sec) => {
            if (sec.type === "custom") {
              return (
                <View key={sec.id} style={[{ marginTop: 12 }, sec.style]}>
                  <AppText variant="label" color="#6B7280" style={{ marginBottom: 6 }}>
                    {sec.title}
                  </AppText>
                  {sec.render()}
                </View>
              );
            }

            if (sec.type === "toggle") {
              return (
                <View key={sec.id} style={[{ marginTop: 12 }, sec.style]}>
                  <AppText variant="label" color="#6B7280" style={{ marginBottom: 6 }}>
                    {sec.title}
                  </AppText>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Switch value={sec.value} onValueChange={sec.onChange} />
                    <AppText variant="label">{sec.value ? "On" : "Off"}</AppText>
                  </View>
                </View>
              );
            }

            if (sec.type === "chips-single") {
              return (
                <View key={sec.id} style={[{ marginTop: 12 }, sec.style]}>
                  <AppText variant="label" color="#6B7280" style={{ marginBottom: 6 }}>
                    {sec.title}
                  </AppText>
                  <View style={s.rowWrap}>
                    {sec.options.map((o) => {
                      const active = sec.selected === o.key;
                      return (
                        <Pressable
                          key={o.key}
                          onPress={() => sec.onSelect(o.key)}
                          style={[s.chip, active && s.chipActive]}
                        >
                          <AppText variant="button" weight="800" color={active ? "#FFF" : "#111827"}>
                            {o.label}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            }

            // chips-multi
            return (
              <View key={sec.id} style={[{ marginTop: 12 }, sec.style]}>
                <AppText variant="label" color="#6B7280" style={{ marginBottom: 6 }}>
                  {sec.title}
                </AppText>
                <View style={s.rowWrap}>
                  {sec.options.map((o) => {
                    const active = sec.selected.includes(o.key);
                    return (
                      <Pressable
                        key={o.key}
                        onPress={() => sec.onToggle(o.key)}
                        style={[s.chip, active && s.chipActive]}
                      >
                        <AppText variant="button" weight="800" color={active ? "#FFF" : "#111827"}>
                          {o.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={[s.rowSpace, { marginTop: 16 }]}>
          <Pressable style={[s.actionBtn, { backgroundColor: "#6B7280" }]} onPress={onReset}>
            <AppText variant="button" weight="800" color="#FFF">
              {labels.reset ?? "Reset"}
            </AppText>
          </Pressable>
          <Pressable style={[s.actionBtn, { backgroundColor: "#111827" }]} onPress={onApply}>
            <AppText variant="button" weight="800" color="#FFF">
              {labels.apply ?? "Apply"}
            </AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  card: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    backgroundColor: "#FFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -6 },
    maxHeight: screenHeight *0.8, 
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#FFF",
  },
  chipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rowSpace: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  actionBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
});