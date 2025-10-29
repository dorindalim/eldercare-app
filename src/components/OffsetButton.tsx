import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";

type OffsetButtonProps = {
  label?: string;
  children?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  testID?: string;

  style?: ViewStyle;        
  contentStyle?: ViewStyle; 
  textStyle?: TextStyle;

  height?: number;            
  radius?: number;          
  bgColor?: string;           
  borderColor?: string;       
  borderColorActive?: string; 
  textColor?: string;         
  textColorActive?: string;   

  offsetLeft?: number;       
  offsetTop?: number;         
  offsetRight?: number;       
  offsetBottom?: number;      
};

export default function OffsetButton({
  label,
  children,
  onPress,
  disabled,
  loading,
  accessibilityLabel,
  testID,
  style,
  contentStyle,
  textStyle,
  height,
  radius = 8,
  bgColor = "#FED787",
  borderColor = "#1F2937",
  borderColorActive = "#000",
  textColor = "#1F2937",
  textColorActive = "#0B1220",
  offsetLeft = 3,
  offsetTop = 3,
  offsetRight = -5,
  offsetBottom = -5,
}: OffsetButtonProps) {
  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || label}
        testID={testID}
        style={styles.touchable}
      >
        {({ pressed }) => (
          <>
            <View
              pointerEvents="none"
              style={[
                styles.offsetBorder,
                {
                  left: offsetLeft,
                  top: offsetTop,
                  right: offsetRight,
                  bottom: offsetBottom,
                  borderRadius: radius,
                  backgroundColor: pressed ? "#000" : "#FFFAF0",    
                  borderColor: "#000",            
                  borderWidth: pressed ? 3 : 2,   
                  opacity: disabled ? 0 : 1,
                },
              ]}
            />

            <View
              style={[
                styles.face,
                {
                  height,
                  borderRadius: radius,
                  backgroundColor: bgColor,
                  borderColor: pressed ? borderColorActive : borderColor,
                  transform: pressed ? [{ translateX: -1 }, { translateY: -1 }] : [],
                  opacity: 1
                },
                contentStyle,
              ]}
            >
              {loading ? (
                <ActivityIndicator />
              ) : children ? (
                children
              ) : (
                <Text
                  style={[
                    styles.text,
                    { color: pressed ? textColorActive : textColor },
                    textStyle,
                  ]}
                >
                  {label}
                </Text>
              )}
            </View>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", marginTop: 6, marginBottom: 6 },
  touchable: { position: "relative" },
  offsetBorder: { position: "absolute", zIndex: 0 },
  face: {
    zIndex: 1,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { fontWeight: "800", fontSize: 18 },
});
