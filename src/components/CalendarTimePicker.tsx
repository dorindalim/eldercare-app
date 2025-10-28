import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Props = {
  visible?: boolean;            // keep for modal mode
  inline?: boolean;             // NEW: render inline (no modal)
  value?: Date;                 // initial/current value
  onClose?: () => void;         // modal-close handler (ignored for inline)
  onConfirm: (d: Date) => void; // fired when user taps Done (or picks in inline)
  minuteStep?: number;          // default 5
  locale?: string;              // e.g. "en-SG"
  title?: string;               // header title
};

const COLORS = {
  bg: "#FFF7EE",
  border: "#111827",
  headerMint: "#CFEFD1",
  headerText: "#111827",
  gridBg: "#FFFFFF",
  disabledBg: "#EFEFEF",
  dayText: "#111827",
  mutedText: "#6B7280",
  selectedBg: "#C9A7F2",
  selectedText: "#111111",
  btnMint: "#CFEFD1",
  btnPurple: "#C9A7F2",
};

function startOfMonth(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addMonths(d: Date, m: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + m);
  return x;
}
function daysInMonth(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return x.getDate();
}
function getMonthLabel(d: Date, locale = "en-SG") {
  try {
    return d.toLocaleString(locale, { month: "long", year: "numeric" });
  } catch {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function CalendarTimePicker({
  visible = false,
  inline = false,
  value,
  onClose,
  onConfirm,
  minuteStep = 5,
  locale = "en-SG",
  title = "Date & Time",
}: Props) {
  // --- state that will be rehydrated from `value` whenever opened/prop changes
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(value ? new Date(value) : new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(value ? new Date(value) : new Date());

  const [hour12, setHour12] = useState<number>(() => {
    const d = value ? new Date(value) : new Date();
    const h = d.getHours();
    return ((h + 11) % 12) + 1;
  });
  const [ampm, setAmpm] = useState<"AM" | "PM">(() => (value ? new Date(value).getHours() >= 12 : new Date().getHours() >= 12) ? "PM" : "AM");
  const [minute, setMinute] = useState<number>(() => {
    const d = value ? new Date(value) : new Date();
    return Math.round(d.getMinutes() / minuteStep) * minuteStep % 60;
  });

  // Important: (re)hydrate when visible toggles on OR when `value` changes.
  useEffect(() => {
    // Inline should sync immediately, modal should sync each time it shows.
    if (inline || visible) {
      const base = value ? new Date(value) : new Date();
      setSelectedDate(base);
      setViewMonth(startOfMonth(base));
      const h = base.getHours();
      setHour12(((h + 11) % 12) + 1);
      setAmpm(h >= 12 ? "PM" : "AM");
      setMinute((Math.round(base.getMinutes() / minuteStep) * minuteStep) % 60);
    }
  }, [value, visible, inline, minuteStep]);

  const monthMatrix = useMemo(() => {
    const m0 = startOfMonth(viewMonth);
    const firstWeekday = (m0.getDay() + 7) % 7; // Sun=0..Sat=6
    const dim = daysInMonth(m0);

    const pm = addMonths(m0, -1);
    const dimPrev = daysInMonth(pm);

    const cells: { date: Date; inMonth: boolean; key: string }[] = [];
    // lead
    for (let i = 0; i < firstWeekday; i++) {
      const d = new Date(pm.getFullYear(), pm.getMonth(), dimPrev - firstWeekday + 1 + i);
      cells.push({ date: d, inMonth: false, key: `p-${d.toDateString()}` });
    }
    // cur
    for (let i = 1; i <= dim; i++) {
      const d = new Date(m0.getFullYear(), m0.getMonth(), i);
      cells.push({ date: d, inMonth: true, key: `c-${d.toDateString()}` });
    }
    // trail to 6*7
    let next = 1;
    while (cells.length % 7 !== 0) {
      const d = new Date(m0.getFullYear(), m0.getMonth() + 1, next++);
      cells.push({ date: d, inMonth: false, key: `n-${d.toDateString()}` });
    }
    while (cells.length < 42) {
      const d = new Date(m0.getFullYear(), m0.getMonth() + 1, next++);
      cells.push({ date: d, inMonth: false, key: `n2-${d.toDateString()}` });
    }
    return Array.from({ length: 6 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
  }, [viewMonth]);

  const times = useMemo(() => {
    const arr: { label: string; value: number }[] = [];
    for (let m = 0; m < 60; m += minuteStep) arr.push({ label: String(m).padStart(2, "0"), value: m });
    return arr;
  }, [minuteStep]);

  function buildDate(): Date {
    const h24 = ampm === "AM" ? hour12 % 12 : (hour12 % 12) + 12;
    const d = new Date(selectedDate);
    d.setHours(h24, minute, 0, 0);
    return d;
  }

  function commit() {
    onConfirm(buildDate());
  }

  // ---------- UI ----------
  const Frame = (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>

      {/* Calendar */}
      <View style={styles.calendarFrame}>
        {/* Month header */}
        <View style={styles.monthHeader}>
          <Pressable onPress={() => setViewMonth(addMonths(viewMonth, -1))} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={COLORS.headerText} />
          </Pressable>
          <Text style={styles.monthLabel}>{getMonthLabel(viewMonth, locale)}</Text>
          <Pressable onPress={() => setViewMonth(addMonths(viewMonth, 1))} hitSlop={10}>
            <Ionicons name="chevron-forward" size={20} color={COLORS.headerText} />
          </Pressable>
        </View>
        <View style={styles.divider} />

        {/* Weekdays */}
        <View style={styles.weekRow}>
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((w) => (
            <Text key={w} style={styles.weekLabel}>{w}</Text>
          ))}
        </View>

        {/* Grid */}
        <View style={{ paddingHorizontal: 8, paddingBottom: 8 }}>
          {monthMatrix.map((row, i) => (
            <View key={`r-${i}`} style={styles.dayRow}>
              {row.map(({ date, inMonth, key }) => {
                const isSelected = sameDay(date, selectedDate);
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      setSelectedDate(date);
                      if (!inMonth) setViewMonth(startOfMonth(date));
                      if (inline) {
                        // in inline mode, update parent immediately
                        onConfirm(buildDate());
                      }
                    }}
                    style={[
                      styles.dayCell,
                      !inMonth && styles.dayCellDisabled,
                      isSelected && styles.dayCellSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        !inMonth && styles.dayTextMuted,
                        isSelected && styles.dayTextSelected,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Time bottom + AM/PM */}
      <View style={styles.controlsRow}>
        {/* Hour+Minute quick picker */}
        <View style={styles.dropdownWrap}>
          <View style={styles.dropdownBtn}>
            <Text style={styles.dropdownText}>
              Time: {String(hour12).padStart(2, "0")}:{String(minute).padStart(2, "0")}
            </Text>
          </View>
          <View style={styles.dropdownListStatic}>
            <ScrollView style={{ maxHeight: 160 }}>
              {Array.from({ length: 12 }, (_, idx) => idx + 1).map((h) => (
                <View key={`h-${h}`}>
                  <Text style={styles.dropdownSection}>Hour: {h}</Text>
                  <View style={styles.minutesRow}>
                    {times.map((t) => (
                      <Pressable
                        key={`h${h}-m${t.value}`}
                        style={styles.minutePill}
                        onPress={() => {
                          setHour12(h);
                          setMinute(t.value);
                          if (inline) onConfirm(buildDate());
                        }}
                      >
                        <Text style={styles.minutePillText}>
                          {String(h).padStart(2, "0")}:{t.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>

        {/* AM / PM segmented */}
        <View style={styles.segmentWrap}>
          <Pressable
            onPress={() => { setAmpm("AM"); if (inline) onConfirm(buildDate()); }}
            style={[styles.segmentBtn, ampm === "AM" && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, ampm === "AM" && styles.segmentTextActive]}>AM</Text>
          </Pressable>
          <Pressable
            onPress={() => { setAmpm("PM"); if (inline) onConfirm(buildDate()); }}
            style={[styles.segmentBtn, ampm === "PM" && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, ampm === "PM" && styles.segmentTextActive]}>PM</Text>
          </Pressable>
        </View>
      </View>

      {/* Footer (modal only) */}
      {!inline && (
        <View style={styles.footerRow}>
          <Pressable onPress={onClose} style={[styles.footerBtn, styles.cancelBtn]}>
            <Text style={[styles.footerText, { color: COLORS.border }]}>Cancel</Text>
          </Pressable>
          <Pressable onPress={commit} style={[styles.footerBtn, styles.confirmBtn]}>
            <Text style={[styles.footerText, { color: "#111" }]}>Done</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  if (inline) return Frame;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>{Frame}</View>
    </Modal>
  );
}

const CELL = 40;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.bg,
    padding: 12,
  },
  title: { fontSize: 16, fontWeight: "900", color: COLORS.border, marginBottom: 8 },

  calendarFrame: {
    backgroundColor: COLORS.gridBg,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  monthHeader: {
    backgroundColor: COLORS.headerMint,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthLabel: { fontWeight: "900", color: COLORS.headerText, fontSize: 16 },
  divider: { height: 2, backgroundColor: COLORS.border },
  weekRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingTop: 8 },
  weekLabel: { width: CELL, textAlign: "center", color: COLORS.mutedText, fontWeight: "700" },
  dayRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  dayCell: { width: CELL, height: CELL, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dayCellDisabled: { backgroundColor: COLORS.disabledBg, borderRadius: 8 },
  dayCellSelected: { backgroundColor: COLORS.selectedBg, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  dayText: { color: COLORS.dayText, fontWeight: "800" },
  dayTextMuted: { color: COLORS.mutedText },
  dayTextSelected: { color: COLORS.selectedText },

  controlsRow: { marginTop: 12, flexDirection: "row", gap: 10 },

  dropdownWrap: { flex: 1 },
  dropdownBtn: {
    height: 44,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.gridBg,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
  },
  dropdownText: { fontWeight: "800", color: COLORS.border },
  dropdownListStatic: {
    marginTop: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.gridBg,
    padding: 8,
  },
  dropdownSection: { fontWeight: "900", color: COLORS.border, marginTop: 6, marginBottom: 4 },
  minutesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  minutePill: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: COLORS.btnMint,
  },
  minutePillText: { fontWeight: "800", color: COLORS.border },

  segmentWrap: {
    height: 44,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 12,
    flexDirection: "row",
    overflow: "hidden",
  },
  segmentBtn: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.gridBg },
  segmentActive: { backgroundColor: COLORS.btnPurple, borderLeftWidth: 2, borderRightWidth: 2, borderColor: COLORS.border },
  segmentText: { fontWeight: "900", color: COLORS.border },
  segmentTextActive: { color: "#111111" },

  footerRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  footerBtn: {
    flex: 1,
    height: 44,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: { backgroundColor: COLORS.gridBg },
  confirmBtn: { backgroundColor: COLORS.btnMint },
  footerText: { fontWeight: "900" },
});
