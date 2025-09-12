import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  topBar?: React.ReactNode;
  children: React.ReactNode;
  padded?: boolean;
};

export default function Screen({ topBar, children, padded = true }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {topBar}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.centerContent,
            padded && { paddingHorizontal: 24, paddingVertical: 16 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  flex: { flex: 1 },
  centerContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  card: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
});
