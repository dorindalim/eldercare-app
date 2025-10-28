import { memo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import OffsetButton from "./OffsetButton";

type Props = {
  onSave: () => void;
  onContinue: () => void;

  continueDisabled?: boolean;
  saveDisabled?: boolean;

  saveLabel?: string;
  continueLabel?: string;
  saveBg?: string;       // default "#FFFAF0"
  continueBg?: string;   // default "#FED787"

  height?: number;       // default 57
  radius?: number;       // default 14
  maxButtonWidth?: number; // default 240
  edgePadding?: number;  // default 20

  showTopCut?: boolean;    // default true
  cutWidth?: "full" | number; // keep for API compatibility
  showHomePill?: boolean;  // default true

  containerStyle?: ViewStyle;
  rowStyle?: ViewStyle;
  buttonStyle?: ViewStyle;
};

function BottomActionsBar({
  onSave,
  onContinue,
  continueDisabled,
  saveDisabled,

  saveLabel = "Save",
  continueLabel = "Continue",
  saveBg = "#FFFAF0",
  continueBg = "#FED787",

  height = 57,
  radius = 14,
  maxButtonWidth = 240,
  edgePadding = 20,

  showTopCut = true,
  cutWidth = "full", // kept for compatibility
  showHomePill = true,

  containerStyle,
  rowStyle,
  buttonStyle,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);

  return (
    <View
      style={[
        styles.wrap,
        { left: edgePadding, right: edgePadding, paddingBottom: bottomPad },
        containerStyle,
      ]}
      pointerEvents="box-none"
    >
      {/* Full-width black cut line that spans to screen edges */}
      {showTopCut && (
        <View
          style={[
            styles.barEdgeFull,
            { left: -edgePadding, right: -edgePadding }, // extend beyond inner padding
          ]}
        />
      )}

      <View style={[styles.row, rowStyle]}>
        <OffsetButton
          label={saveLabel}
          onPress={onSave}
          height={height}
          radius={radius}
          disabled={saveDisabled}
          style={[
            styles.btn,
            { backgroundColor: saveBg, maxWidth: maxButtonWidth },
            buttonStyle,
          ]}
        />
        <OffsetButton
          label={continueLabel}
          onPress={onContinue}
          height={height}
          radius={radius}
          disabled={continueDisabled}
          style={[
            styles.btn,
            {
              backgroundColor: continueBg,
              maxWidth: maxButtonWidth,
              opacity: continueDisabled ? 0.6 : 1,
            },
            buttonStyle,
          ]}
        />
      </View>

      {showHomePill && <View style={styles.homePill} />}
    </View>
  );
}

export default memo(BottomActionsBar);

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 0,
    backgroundColor: "#CFADE8", // whole bar background
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: 10,
  },
  // absolute, edge-to-edge black line
  barEdgeFull: {
    position: "absolute",
    top: 0,
    height: 2,
    backgroundColor: "#111827",
  },
  row: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  btn: {
    flex: 1,
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
