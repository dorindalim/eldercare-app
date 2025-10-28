import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";

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
  placeholder,
  onChangeText,
  onSubmit,
  onPressFilter,
  style,
}: Props) {
  const { t } = useTranslation();
  return (
    <View style={[styles.box, style]}>
      <Ionicons name="search" size={26} color="#111827" style={styles.leftIcon} />

      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#6B7280"
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
      />

      {!!value && (
        <Pressable
          onPress={() => onChangeText("")}
          hitSlop={10}
          accessibilityLabel={t("common.search.clear")}
          style={styles.iconBtn}
        >
          <Ionicons name="close" size={18} color="#6B7280" />
        </Pressable>
      )}

      {!!onPressFilter && (
        <Pressable
          onPress={onPressFilter}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("common.search.filter")}
          style={styles.iconBtn}
        >
          <Ionicons name="options" size={22} color="#111827" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",      
    borderRadius: 22,                 
    borderWidth: 2,                   
    borderColor: "#111827",
    paddingHorizontal: 12,
    height: 56,                       
  },
  leftIcon: { marginRight: 8 },
  input: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 18,
    color: "#111827",
  },
  iconBtn: {
    padding: 6,
    marginLeft: 4,
  },
});
