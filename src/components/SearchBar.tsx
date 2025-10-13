import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, TextInput, View, ViewStyle } from "react-native";

type Props = {
  value: string;
  placeholder?: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  onPressFilter?: () => void;
  style?: ViewStyle;
};

export default function SearchBar({
  value,
  placeholder = "Search",
  onChangeText,
  onSubmit,
  onPressFilter,
  style,
}: Props) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.box}>
        <Ionicons name="search" size={16} color="#6B7280" style={{ marginHorizontal: 8 }} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          returnKeyType="search"
          onSubmitEditing={onSubmit}
        />
        {!!value && (
          <Pressable onPress={() => onChangeText("")} style={styles.clearBtn}>
            <Ionicons name="close" size={16} color="#6B7280" />
          </Pressable>
        )}
      </View>

      <Pressable style={styles.filter} onPress={onPressFilter} accessibilityRole="button">
        <Ionicons name="options" size={18} color="#111827" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  box: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 8,
  },
  input: { flex: 1, paddingVertical: 6, paddingHorizontal: 4 },
  clearBtn: { padding: 6, marginRight: 6 },
  filter: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
});
