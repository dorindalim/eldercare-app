import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableWithoutFeedback,
  View,
  ViewStyle
} from "react-native";
import AppText from "./AppText";
import OffsetButton from "./OffsetButton"; // Import your OffsetButton

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
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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
                        <OffsetButton
                          key={o.key}
                          onPress={() => sec.onSelect(o.key)}
                          radius={20} // Pill shape
                          bgColor={active ? "#000" : "#FFF"}
                          borderColor="#000" 
                          borderColorActive="#000" 
                          contentStyle={s.chipContent}
                        >
                          <AppText 
                            variant="button" 
                            weight="800" 
                            color="#000" 
                          >
                            {o.label}
                          </AppText>
                        </OffsetButton>
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
                      <OffsetButton
                        key={o.key}
                        onPress={() => sec.onToggle(o.key)}
                        radius={20} // Pill shape
                        bgColor= {active ? "#000" : "#FFF"}
                        borderColor="#000" 
                        borderColorActive="#000" 
                        contentStyle={s.chipContent}
                      >
                        <AppText 
                          variant="button" 
                          weight="800" 
                          color="#000" 
                        >
                          {o.label}
                        </AppText>
                      </OffsetButton>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={[s.rowSpace, { marginTop: 16 }]}>
          {/* Reset Button */}
          <OffsetButton
            onPress={onReset}
            radius={10}
            bgColor="#6B7280"
            borderColor="#000"
            borderColorActive="#000"
            contentStyle={s.actionBtnContent}
            style={s.actionButtonWrapper}
          >
            <AppText variant="button" weight="800" color="#000">
              {labels.reset ?? "Reset"}
            </AppText>
          </OffsetButton>

          {/* Apply Button */}
          <OffsetButton
            onPress={onApply}
            radius={10}
            bgColor="#111827"
            borderColor="#000"
            borderColorActive="#000"
            contentStyle={s.actionBtnContent}
            style={s.actionButtonWrapper}
          >
            <AppText variant="button" weight="800" color="#000">
              {labels.apply ?? "Apply"}
            </AppText>
          </OffsetButton>
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
    backgroundColor: "#FFFAF0",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -6 },
    maxHeight: screenHeight * 0.8, 
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  // Chip styles for filter options
  chipContent: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 2, // This will work with OffsetButton's border
    backgroundColor: 'white', // Let OffsetButton handle background
  },
  rowWrap: { 
    flexDirection: "row", 
    flexWrap: "wrap", 
    gap: 8 
  },
  rowSpace: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 8, 
    flex: 1 
  },
  // Action button styles
  actionButtonWrapper: {
    flex: 1,
  },
  actionBtnContent: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2, 
    backgroundColor: '#fff', 
  },
});