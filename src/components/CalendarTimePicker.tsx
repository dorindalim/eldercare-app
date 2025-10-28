import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import type { ViewStyle } from "react-native";
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

type Props = {
  visible?: boolean;
  inline?: boolean;
  value?: Date;
  onClose?: () => void;
  onConfirm: (d: Date) => void;
  minuteStep?: number;
  locale?: string;
  title?: string;
  framed?: boolean;
  showTitle?: boolean;
  style?: ViewStyle;
};

const COLORS = {
  bg: "#FFF7EE",
  border: "#111827",
  headerMint: "#C9F3D5",
  headerText: "#111827",
  gridBg: "#FFFFFF",
  disabledBg: "#EFEFEF",
  dayText: "#111827",
  mutedText: "#6B7280",
  selectedBg: "#CFADE8",
  selectedText: "#111111",
  btnMint: "#C9F3D5",
  btnPurple: "#CFADE8",
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

function FieldDropdown<T extends string | number>({
  label,
  valueLabel,
  open,
  setOpen,
  options,
  onSelect,
  selectedValue,
}: {
  label: string;
  valueLabel: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  options: Array<{ label: string; value: T }>;
  onSelect: (v: T) => void;
  selectedValue: T;
}) {
  const FIELD_H = 48;

  return (
    <View style={styles.ddContainer}>
      <Text style={styles.ddLabel}>{label}</Text>

      <Pressable
        style={[styles.ddField, { height: FIELD_H }]}
        onPress={() => setOpen(!open)}
        hitSlop={6}
      >
        <Text style={styles.ddFieldText}>{valueLabel}</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={COLORS.border}
        />
      </Pressable>

      {open && (
        <View style={[styles.ddMenu, { top: FIELD_H + 6 }]}>
          <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator>
            {options.map((opt) => {
              const active = opt.value === selectedValue;
              return (
                <Pressable
                  key={`${label}-${opt.label}`}
                  style={[styles.ddItem, active && styles.ddItemActive]} // highlight
                  onPress={() => {
                    onSelect(opt.value);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.ddItemText}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
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
  framed = true,
  showTitle = true,
  style,
}: Props) {
  const initial = value ? new Date(value) : new Date();

  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(initial));
  const [selectedDate, setSelectedDate] = useState<Date>(initial);

  const [hour12, setHour12] = useState<number>(() => {
    const h = initial.getHours();
    return ((h + 11) % 12) + 1;
  });
  const [ampm, setAmpm] = useState<"AM" | "PM">(
    initial.getHours() >= 12 ? "PM" : "AM"
  );
  const [minute, setMinute] = useState<number>(() => {
    return (Math.round(initial.getMinutes() / minuteStep) * minuteStep) % 60;
  });
  const [openHour, setOpenHour] = useState(false);
  const [openMinute, setOpenMinute] = useState(false);

  useEffect(() => {
    if (!value) return;
    const base = new Date(value);
    setSelectedDate(base);
    setViewMonth(startOfMonth(base));
    const h = base.getHours();
    setHour12(((h + 11) % 12) + 1);
    setAmpm(h >= 12 ? "PM" : "AM");
    setMinute((Math.round(base.getMinutes() / minuteStep) * minuteStep) % 60);
  }, [value, minuteStep]);

  const monthMatrix = useMemo(() => {
    const m0 = startOfMonth(viewMonth);
    const firstWeekday = (m0.getDay() + 7) % 7;
    const dim = daysInMonth(m0);

    const pm = addMonths(m0, -1);
    const dimPrev = daysInMonth(pm);

    const cells: { date: Date; inMonth: boolean; key: string }[] = [];
    for (let i = 0; i < firstWeekday; i++) {
      const d = new Date(
        pm.getFullYear(),
        pm.getMonth(),
        dimPrev - firstWeekday + 1 + i
      );
      cells.push({ date: d, inMonth: false, key: `p-${d.toDateString()}` });
    }
    for (let i = 1; i <= dim; i++) {
      const d = new Date(m0.getFullYear(), m0.getMonth(), i);
      cells.push({ date: d, inMonth: true, key: `c-${d.toDateString()}` });
    }
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

  const HOURS = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const times = useMemo(() => {
    const arr: { label: string; value: number }[] = [];
    for (let m = 0; m < 60; m += minuteStep)
      arr.push({ label: String(m).padStart(2, "0"), value: m });
    return arr;
  }, [minuteStep]);

  function buildDateWith(
    baseDate: Date,
    h12 = hour12,
    m = minute,
    ap: "AM" | "PM" = ampm
  ): Date {
    const h24 = ap === "AM" ? h12 % 12 : (h12 % 12) + 12;
    const d = new Date(baseDate);
    d.setHours(h24, m, 0, 0);
    return d;
  }
  function buildDate(): Date {
    return buildDateWith(selectedDate, hour12, minute, ampm);
  }
  function commit() {
    onConfirm(buildDate());
  }

  const Frame = (
    <View style={[styles.card, !framed && styles.cardBare, style]}>
      {showTitle && !!title && <Text style={styles.title}>{title}</Text>}

      <View style={styles.calendarOutline}>
        <View style={[styles.calendarFrame, !framed && styles.borderless]}>
          {/* Month header */}
          <View style={styles.monthHeader}>
            <Pressable
              onPress={() => setViewMonth(addMonths(viewMonth, -1))}
              hitSlop={10}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={COLORS.headerText}
              />
            </Pressable>
            <Text style={styles.monthLabel}>
              {getMonthLabel(viewMonth, locale)}
            </Text>
            <Pressable
              onPress={() => setViewMonth(addMonths(viewMonth, 1))}
              hitSlop={10}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={COLORS.headerText}
              />
            </Pressable>
          </View>

          <View style={styles.divider} />

          {/* Weekdays */}
          <View style={styles.weekRow}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
              <Text key={w} style={styles.weekLabel}>
                {w}
              </Text>
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
                        if (inline) onConfirm(buildDateWith(date));
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
      </View>

      {/* Time + AM/PM — single line */}
      <View style={styles.controlsRow}>
        <View style={styles.timeRow}>
          <FieldDropdown
            label="Hour"
            valueLabel={String(hour12).padStart(2, "0")}
            open={openHour}
            setOpen={(v) => {
              setOpenHour(v);
              if (v) setOpenMinute(false);
            }}
            options={HOURS.map((h) => ({
              label: String(h).padStart(2, "0"),
              value: h,
            }))}
            onSelect={(h) => {
              setHour12(h);
              if (inline)
                onConfirm(buildDateWith(selectedDate, h, minute, ampm));
            }}
            selectedValue={hour12}
          />

          <FieldDropdown
            label="Minute"
            valueLabel={String(minute).padStart(2, "0")}
            open={openMinute}
            setOpen={(v) => {
              setOpenMinute(v);
              if (v) setOpenHour(false);
            }}
            options={times.map((t) => ({ label: t.label, value: t.value }))}
            onSelect={(m) => {
              setMinute(m);
              if (inline)
                onConfirm(buildDateWith(selectedDate, hour12, m, ampm));
            }}
            selectedValue={minute}
          />

          {/* AM/PM segmented */}
          <View style={styles.ampmGroup}>
            <Pressable
              onPress={() => {
                setAmpm("AM");
                if (inline)
                  onConfirm(buildDateWith(selectedDate, hour12, minute, "AM"));
              }}
              style={[styles.segmentBtn, ampm === "AM" && styles.segmentActive]}
            >
              <Text
                style={[
                  styles.segmentText,
                  ampm === "AM" && styles.segmentTextActive,
                ]}
              >
                AM
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setAmpm("PM");
                if (inline)
                  onConfirm(buildDateWith(selectedDate, hour12, minute, "PM"));
              }}
              style={[styles.segmentBtn, ampm === "PM" && styles.segmentActive]}
            >
              <Text
                style={[
                  styles.segmentText,
                  ampm === "PM" && styles.segmentTextActive,
                ]}
              >
                PM
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Footer */}
      {!inline && (
        <View style={styles.footerRow}>
          <Pressable
            onPress={onClose}
            style={[styles.footerBtn, styles.cancelBtn]}
          >
            <Text style={[styles.footerText, { color: COLORS.border }]}>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={commit}
            style={[styles.footerBtn, styles.confirmBtn]}
          >
            <Text style={[styles.footerText, { color: "#111" }]}>Done</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  if (inline) return Frame;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
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
    borderWidth: 0,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.bg,
    padding: 12,
  },
  cardBare: {
    borderWidth: 0,
    backgroundColor: "transparent",
    padding: 0,
    borderRadius: 0,
  },

  borderless: { borderWidth: 0, borderRadius: 0 },
  headerBorderless: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },

  title: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.border,
    marginBottom: 8,
  },

  calendarOutline: {
    borderWidth: 3,
    borderColor: COLORS.border,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: COLORS.gridBg,
  },

  calendarFrame: {
    backgroundColor: COLORS.gridBg,
    borderWidth: 0,
    borderColor: COLORS.border,
    borderRadius: 0,
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

  divider: { height: 3, backgroundColor: COLORS.border },

  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  weekLabel: {
    width: CELL,
    textAlign: "center",
    color: COLORS.mutedText,
    fontWeight: "700",
  },
  dayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  dayCell: {
    width: CELL,
    height: CELL,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCellDisabled: { backgroundColor: COLORS.disabledBg, borderRadius: 8 },
  dayCellSelected: {
    backgroundColor: COLORS.selectedBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dayText: { color: COLORS.dayText, fontWeight: "800" },
  dayTextMuted: { color: COLORS.mutedText },
  dayTextSelected: { color: COLORS.selectedText },

  controlsRow: {
    marginTop: 12,
  },
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

  timeWrap: { flex: 1 },
  timeRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  groupLabel: { fontWeight: "900", color: COLORS.border, marginBottom: 6 },
  hourRow: { gap: 8, paddingRight: 4 },
  minuteGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.gridBg,
  },
  pillActive: { backgroundColor: COLORS.btnMint },
  pillText: { fontWeight: "900", color: COLORS.border },
  pillTextActive: { color: "#111111" },

  ampmRow: { alignSelf: "flex-start" },
  ampmWrap: {
    height: 44,
    width: 180,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 12,
    flexDirection: "row",
    overflow: "hidden",
  },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.gridBg,
  },
  segmentActive: {
    backgroundColor: COLORS.btnPurple,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: COLORS.border,
  },
  segmentText: { fontWeight: "900", color: COLORS.border },
  segmentTextActive: { color: "#111111" },

  ddLabel: {
    fontWeight: "900",
    color: COLORS.border,
    marginBottom: 6,
  },
  ddField: {
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.gridBg,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ddFieldText: {
    fontWeight: "900",
    color: COLORS.border,
  },
  ddMenu: {
    position: "absolute",
    left: 0,
    right: 0,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.gridBg,
    zIndex: 10,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  ddText: { fontWeight: "900", color: COLORS.border },

  ddBackdrop: {
    position: "absolute",
    inset: 0,
  },
  ddPanelWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  ddPanel: {
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.gridBg,
    overflow: "hidden",
  },
  ddItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  ddItemActive: {
    backgroundColor: "#FFFAF0",
  },
  ddItemText: {
    fontWeight: "800",
    color: COLORS.border,
  },
  ddItemTextActive: { color: "#111111" },
  ddContainer: {
    position: "relative",
    width: 120,
    zIndex: 3,
  },
  ampmGroup: {
    height: 48,
    flex: 1,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: "hidden",
    flexDirection: "row",
    minWidth: 140,
  },
  ampmInline: {
    height: 44,
    flexDirection: "row",
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.gridBg,
    flexShrink: 0,
  },
});
