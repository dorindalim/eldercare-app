import { Pressable, StyleSheet, View } from "react-native";
import AppText from "./AppText";

type Props = {
  page: number;        
  total: number;       
  onChange: (p: number) => void;
};

export default function Pagination({ page, total, onChange }: Props) {
  const pageWindow = (current: number, last: number, len = 5) => {
    const half = Math.floor(len / 2);
    let start = Math.max(1, current - half);
    let end = Math.min(last, start + len - 1);
    start = Math.max(1, end - len + 1);
    const pages: number[] = [];
    for (let p = start; p <= end; p++) pages.push(p);
    return pages;
  };

  const pages = pageWindow(page, Math.max(1, total), 5);

  return (
    <View style={s.bar}>
      <Pressable onPress={() => onChange(1)} disabled={page === 1} style={[s.icon, page === 1 && s.dis]}>
        <AppText variant="button" weight="800" color={page === 1 ? "#9CA3AF" : "#111827"}>«</AppText>
      </Pressable>

      <Pressable onPress={() => onChange(Math.max(1, page - 1))} disabled={page === 1} style={[s.icon, page === 1 && s.dis]}>
        <AppText variant="button" weight="800" color={page === 1 ? "#9CA3AF" : "#111827"}>‹</AppText>
      </Pressable>

      <View style={s.nums}>
        {pages.map((n) => (
          <Pressable key={n} onPress={() => onChange(n)} style={s.numBtn} disabled={n === page}>
            <AppText variant="label" weight={n === page ? "900" : "700"} color={n === page ? "#111827" : "#9CA3AF"}>
              {n}
            </AppText>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={() => onChange(Math.min(total, page + 1))} disabled={page >= total} style={[s.icon, page >= total && s.dis]}>
        <AppText variant="button" weight="800" color={page >= total ? "#9CA3AF" : "#111827"}>›</AppText>
      </Pressable>

      <Pressable onPress={() => onChange(total)} disabled={page >= total} style={[s.icon, page >= total && s.dis]}>
        <AppText variant="button" weight="800" color={page >= total ? "#9CA3AF" : "#111827"}>»</AppText>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    marginTop: 8,
    marginBottom: 16,
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  icon: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  dis: { opacity: 0.5 },
  nums: { flexDirection: "row", alignItems: "center", gap: 14 },
  numBtn: { paddingHorizontal: 2, paddingVertical: 2 },
});
