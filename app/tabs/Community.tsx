import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  BackHandler,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppText from "../../src/components/AppText";
import TopBar, { type LangCode } from "../../src/components/TopBar";
import { supabase } from "../../src/lib/supabase";

type EventRow = {
  event_id: string;
  title: string;
  description: string | null;
  category: string | null;
  location_name: string | null;
  address: string | null;
  organizer: string | null;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  fee: string | null;
  registration_link: string | null;
};

type LatLng = { latitude: number; longitude: number };

const PAGE_SIZE = 10;
const ACCENT = "#007AFF";
const APPLY = "#111827";
const SEARCH = "#111827";
const BG = "#F8FAFC";
const CARD_BORDER = "#E5E7EB";
const DARK = "#111827";

const GOOGLE_WEB_API_KEY = "AIzaSyDaNhQ7Ah-mlf2j4qHZTjXgtzrP-uBokGs";

const CATEGORIES = [
  "Health & Fitness",
  "Arts & Culture",
  "Active Aging",
  "Parenting & Education",
  "Exhibition & Fair",
  "Neighbourhood Events",
  "Celebration & Festivity",
  "Kopi Talks & Dialogues",
  "Charity & Volunteerism",
  "Overseas Outings & Tours",
] as const;

const CATEGORY_SLUG: Record<string, string> = {
  "Health & Fitness": "healthFitness",
  "Arts & Culture": "artsCulture",
  "Active Aging": "activeAging",
  "Parenting & Education": "parentingEducation",
  "Exhibition & Fair": "exhibitionFair",
  "Neighbourhood Events": "neighbourhoodEvents",
  "Celebration & Festivity": "celebrationFestivity",
  "Kopi Talks & Dialogues": "kopiTalksDialogues",
  "Charity & Volunteerism": "charityVolunteerism",
  "Overseas Outings & Tours": "overseasOutingsTours",
};

const catLabel = (c: string, t: any) =>
  t(`community.categories.${CATEGORY_SLUG[c] || c}`, c);

const catListLabel = (arr: string[], t: any) => arr.map((c) => catLabel(c, t));

type TimeFilter = "today" | "week" | "upcoming";
type DistanceSort = "none" | "near" | "far";
type PricingFilter = "all" | "free" | "paid";

function Dropdown({
  label,
  display,
  children,
  open,
  setOpen,
}: {
  label: string;
  display: string;
  children: React.ReactNode;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  return (
    <View style={{ marginTop: 8 }}>
      <Pressable
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [
          styles.dropHeader,
          pressed && { backgroundColor: "#F3F4F6", transform: [{ scale: 0.996 }] },
        ]}
        accessibilityRole="button"
      >
        <AppText variant="label" color="#6B7280">
          {label}
        </AppText>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <AppText variant="button" weight="800" numberOfLines={1} style={{ maxWidth: 210 }}>
            {display}
          </AppText>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={18}
            color="#9CA3AF"
            style={{ marginLeft: 6 }}
          />
        </View>
      </Pressable>
      {open && <View style={styles.dropBody}>{children}</View>}
    </View>
  );
}

function Chip({
  active,
  children,
  onPress,
}: {
  active?: boolean;
  children: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <AppText variant="button" weight="800" color={active ? "#FFF" : DARK}>
        {children}
      </AppText>
    </Pressable>
  );
}

export default function CommunityScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const setLang = async (code: string) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  // Location
  const [myLoc, setMyLoc] = useState<LatLng | null>(null);

  // Filters
  const [keyword, setKeyword] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");
  const [distanceSort, setDistanceSort] = useState<DistanceSort>("near");
  const [pricingFilter, setPricingFilter] = useState<PricingFilter>("all");

  // Dropdown panel state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tmpCategories, setTmpCategories] = useState<string[]>([]);
  const [tmpTimeFilter, setTmpTimeFilter] = useState<TimeFilter>(timeFilter);
  const [tmpDistanceSort, setTmpDistanceSort] = useState<DistanceSort>(distanceSort);
  const [tmpPricingFilter, setTmpPricingFilter] = useState<PricingFilter>(pricingFilter);

  // Dropdown open states
  const [catOpen, setCatOpen] = useState(true);
  const [timeOpen, setTimeOpen] = useState(false);
  const [distOpen, setDistOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  // Data
  const [events, setEvents] = useState<(EventRow & { _distance?: number | null })[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // Expanded/collapsed cards
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Geocode cache
  const geoCache = useRef<Map<string, LatLng>>(new Map());

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({});
        setMyLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      }
    })();
    (async () => {
      const keys = await AsyncStorage.getAllKeys();
      const hits = keys.filter((k) => k.startsWith("geo:"));
      const items = await AsyncStorage.multiGet(hits);
      items.forEach(([k, v]) => {
        if (v) {
          try {
            geoCache.current.set(k.slice(4), JSON.parse(v));
          } catch {}
        }
      });
    })();
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => false);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [page, keyword, categories, timeFilter, pricingFilter, i18n.language]);

  /* Format/Calculation */
  const formatTime = (hhmmss?: string | null) => {
    if (!hhmmss) return "";
    const [hStr, mStr] = hhmmss.split(":");
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    const mm = String(m).padStart(2, "0");
    return `${h}${mm !== "00" ? ":" + mm : ""} ${ampm}`;
  };
  const toISODate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const timeRange = (): { from?: string; to?: string } => {
    const now = new Date();
    if (timeFilter === "today") {
      const d = toISODate(now);
      return { from: d, to: d };
    }
    if (timeFilter === "week") {
      const from = toISODate(now);
      const end = new Date(now);
      end.setDate(end.getDate() + 7);
      return { from, to: toISODate(end) };
    }
    return { from: toISODate(now) }; 
  };
  const distanceMeters = (a: LatLng, b: LatLng) => {
    const R = 6371e3;
    const φ1 = (a.latitude * Math.PI) / 180;
    const φ2 = (b.latitude * Math.PI) / 180;
    const Δφ = ((b.latitude - a.latitude) * Math.PI) / 180;
    const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;
    const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };
  const kmStr = (m?: number | null) =>
    m == null ? "" : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;

  const geocode = async (q: string): Promise<LatLng | null> => {
    if (geoCache.current.has(q)) return geoCache.current.get(q)!;
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        q
      )}&key=${GOOGLE_WEB_API_KEY}`;
      const res = await fetch(url);
      const json = await res.json();
      const loc = json?.results?.[0]?.geometry?.location;
      if (loc) {
        const pt = { latitude: loc.lat, longitude: loc.lng };
        geoCache.current.set(q, pt);
        AsyncStorage.setItem(`geo:${q}`, JSON.stringify(pt)).catch(() => {});
        return pt;
      }
    } catch {}
    return null;
  };

  /* Fetch events from Supabase */
  const fetchEvents = async () => {
    setLoading(true);
    try {
      const { from, to } = timeRange();

      let query = supabase
        .from("events")
        .select("*", { count: "exact" })
        .order("start_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (keyword.trim()) query = query.ilike("title", `%${keyword.trim()}%`);

      if (categories.length > 0) {
        query = query.in("category", categories);
      }

      if (from) query = query.gte("start_date", from);
      if (to) query = query.lte("start_date", to);

      if (pricingFilter === "free") {
        query = query.or("fee.is.null,fee.ilike.Free");
      } else if (pricingFilter === "paid") {
        query = query.not("fee", "is", "null").not("fee", "ilike", "Free");
      }

      const start = (page - 1) * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;
      const { data, count, error } = await query.range(start, end);
      if (error) throw error;

      let rows = (data || []) as EventRow[];
      let withDist: (EventRow & { _distance?: number | null })[] = [...rows];

      if (myLoc) {
        await Promise.all(
          withDist.map(async (r, i) => {
            const q = r.address?.trim() || r.location_name?.trim();
            let d: number | null = null;
            if (q) {
              const pt = await geocode(q);
              if (pt) d = distanceMeters(myLoc, pt);
            }
            withDist[i]._distance = d;
          })
        );
      }

      if (myLoc && distanceSort !== "none") {
        withDist.sort((a, b) => {
          const da = a._distance ?? Infinity;
          const db = b._distance ?? Infinity;
          return distanceSort === "near" ? da - db : db - da;
        });
      }

      setEvents(withDist);
      setTotal(count || 0);
    } catch (e: any) {
      Alert.alert("Load error", e?.message || String(e));
      setEvents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageWindow = (current: number, last: number, len = 5) => {
    const half = Math.floor(len / 2);
    let start = Math.max(1, current - half);
    let end = Math.min(last, start + len - 1);
    start = Math.max(1, end - len + 1);
    const pages: number[] = [];
    for (let p = start; p <= end; p++) pages.push(p);
    return pages;
  };
  const pages = pageWindow(page, totalPages, 5);

  const categoryNote = useMemo(() => {
    if (categories.length === 0) return null;
    const label =
      categories.length <= 2
        ? catListLabel(categories, t).join(", ")
        : `${categories.length} ${t("community.filters.categories").toLowerCase()}`;
    const key = total === 1 ? "community.categorySummary.one" : "community.categorySummary.other";
    return t(key, { count: total, category: label });
  }, [categories, total, t]);

  const timingText = (tf: TimeFilter) =>
    tf === "today"
      ? t("community.timing.today")
      : tf === "week"
      ? t("community.timing.week")
      : t("community.timing.upcoming");

  const distanceText = (ds: DistanceSort) =>
    ds === "near"
      ? t("community.distance.near")
      : ds === "far"
      ? t("community.distance.far")
      : t("community.distance.none");

  const priceText = (pf: PricingFilter) =>
    pf === "free"
      ? t("community.price.freeOnly")
      : pf === "paid"
      ? t("community.price.paidOnly")
      : t("community.filters.price") + ": " + t("community.price.all");

  const onRegister = async (url?: string | null) => {
    if (!url) return Alert.alert(t("community.register"), t("community.noResults"));
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Linking.openURL(url).catch(() => {
        Alert.alert(t("community.register"), "Please try again later.");
      });
    }
  };

  const onDirections = (evt: EventRow) => {
    const q = (evt.address && evt.address.trim()) || (evt.location_name && evt.location_name.trim());
    if (!q) return Alert.alert(t("community.getDirections"), t("community.noResults"));
    router.push({ pathname: "/tabs/Navigation", params: { presetQuery: q } });
  };

  /* Card for each event */
  const RenderCard = ({ item }: { item: EventRow & { _distance?: number | null } }) => {
    const timePart =
      [formatTime(item.start_time), formatTime(item.end_time)]
        .filter(Boolean)
        .join(" - ") || "—";
    const feePart = item.fee?.trim() || t("community.ui.free");
    const distPart = kmStr(item._distance);
    const isOpen = expandedIds.has(item.event_id);

    const toggle = () => {
      const next = new Set(expandedIds);
      isOpen ? next.delete(item.event_id) : next.add(item.event_id);
      setExpandedIds(next);
    };

    return (
      <View style={styles.card}>
        {/* Header row */}
        <Pressable onPress={toggle} style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <AppText variant="title" weight="800" style={{ marginBottom: 2 }}>
              {item.title}
            </AppText>

            <View style={styles.metaRow}>
              <AppText variant="label" color="#374151" weight="700">
                {item.location_name || "—"}
              </AppText>
              {!!distPart && (
                <AppText variant="label" color="#6B7280" weight="700">
                  · {distPart}
                </AppText>
              )}
            </View>
            <View style={styles.metaRowBetween}>
              <AppText variant="label" color="#111827" weight="700" style={{ flexShrink: 1 }}>
                {timePart}
              </AppText>
              <AppText variant="label" weight="800" style={styles.feeTag}>
                {feePart}
              </AppText>
            </View>
          </View>
          <TouchableOpacity
            hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
            onPress={toggle}
            style={{ marginLeft: 8, padding: 4 }}
          >
            <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </Pressable>

        {/* Expanded details */}
        {isOpen && (
          <View style={styles.expandBody}>
            <AppText variant="body" color="#111827" style={{ marginBottom: 10 }}>
              {item.description || "No description."}
            </AppText>

            <View style={styles.rowSpace}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: DARK }]}
                onPress={() => onRegister(item.registration_link)}
              >
                <AppText variant="button" weight="800" color="#FFF">
                  {t("community.register")}
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#a3491d" }]}
                onPress={() => onDirections(item)}
              >
                <AppText variant="button" weight="800" color="#FFF">
                  {t("community.getDirections")}
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  const summaryText =
    categories.length || timeFilter !== "upcoming" || distanceSort !== "near" || pricingFilter !== "all"
      ? t("community.sortSummary.custom", {
          categories:
            categories.length === 0
              ? t("community.filters.categories")
              : categories.length <= 2
              ? catListLabel(categories, t).join(", ")
              : `${categories.length} ${t("community.filters.categories").toLowerCase()}`,
          timing: timingText(timeFilter),
          distance: distanceText(distanceSort),
        }) +
        " · " +
        (pricingFilter === "all"
          ? t("community.filters.price") + ": " + t("community.price.all")
          : priceText(pricingFilter))
      : t("community.sortSummary.default");

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={setLang as (c: LangCode) => void}
        title={t("community.title")}
        showHeart={false}
      />

      {/* Search */}
      <View style={styles.controls}>
        <View style={styles.searchRow}>
          <TextInput
            placeholder={t("community.searchPlaceholder")}
            value={keyword}
            onChangeText={(t2) => {
              setKeyword(t2);
              setPage(1);
            }}
            onSubmitEditing={() => setPage(1)}
            returnKeyType="search"
            style={styles.input}
          />
          <TouchableOpacity activeOpacity={0.8} style={styles.searchBtn} onPress={() => setPage(1)}>
            <AppText variant="button" weight="800" color="#FFF">
              {t("community.ui.search")}
            </AppText>
          </TouchableOpacity>
        </View>

        {/* Summary chip (tap to open filters panel) */}
        <Pressable
          style={styles.summaryRow}
          onPress={() => {
            setTmpCategories(categories);
            setTmpTimeFilter(timeFilter);
            setTmpDistanceSort(distanceSort);
            setTmpPricingFilter(pricingFilter);
            setCatOpen(true);
            setTimeOpen(false);
            setDistOpen(false);
            setPriceOpen(false);
            setFiltersOpen(true);
          }}
        >
          <AppText variant="caption" color="#6B7280" numberOfLines={1}>
            {summaryText} {"  ▼"}
          </AppText>
        </Pressable>

        {!!categoryNote && (
          <AppText variant="caption" color="#6B7280" style={{ marginTop: 6 }}>
            {categoryNote}
          </AppText>
        )}
      </View>

      {/* List */}
      <FlatList
        data={events}
        keyExtractor={(it) => it.event_id}
        renderItem={RenderCard}
        contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
        ListEmptyComponent={
          <View style={{ padding: 16 }}>
            <AppText variant="label" color="#6B7280">
              {t("community.noResults")}
            </AppText>
          </View>
        }
        refreshing={loading}
        onRefresh={() => fetchEvents()}
        ListFooterComponent={
          totalPages > 1 ? (
            <View style={styles.paginationBar}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={[styles.pageIcon, page === 1 && styles.pageDisabled]}
              >
                <AppText variant="button" weight="800" color={page === 1 ? "#9CA3AF" : DARK}>
                  ‹
                </AppText>
              </Pressable>

              <View style={styles.pageNums}>
                {pages.map((n) => (
                  <Pressable key={n} onPress={() => setPage(n)} style={styles.pageNumBtn} disabled={n === page}>
                    <AppText variant="label" weight={n === page ? "900" : "700"} color={n === page ? DARK : "#9CA3AF"}>
                      {n}
                    </AppText>
                  </Pressable>
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={[styles.pageIcon, page >= totalPages && styles.pageDisabled]}
              >
                <AppText variant="button" weight="800" color={page >= totalPages ? "#9CA3AF" : DARK}>
                  ›
                </AppText>
              </Pressable>
            </View>
          ) : (
            <View />
          )
        }
      />

      {/* Filters Panel Modal */}
      {filtersOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setFiltersOpen(false)}>
          <TouchableWithoutFeedback onPress={() => setFiltersOpen(false)}>
            <View style={styles.overlay} />
          </TouchableWithoutFeedback>

          <View style={styles.dropdownPanel}>
            <AppText variant="title" weight="900">
              {t("community.filters.title")}
            </AppText>

            {/* Categories */}
            <Dropdown
              label={t("community.filters.categories")}
              display={
                tmpCategories.length
                  ? tmpCategories.length <= 2
                    ? catListLabel(tmpCategories, t).join(", ")
                    : `${tmpCategories.length} ${t("community.filters.categories").toLowerCase()}`
                  : t("community.price.all")
              }
              open={catOpen}
              setOpen={(v) => {
                setCatOpen(v);
                if (v) {
                  setTimeOpen(false);
                  setDistOpen(false);
                  setPriceOpen(false);
                }
              }}
            >
              <View style={styles.chipsWrap}>
                {CATEGORIES.map((c) => {
                  const active = tmpCategories.includes(c);
                  return (
                    <Chip
                      key={c}
                      active={active}
                      onPress={() =>
                        setTmpCategories((prev) =>
                          prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                        )
                      }
                    >
                      {catLabel(c, t)}
                    </Chip>
                  );
                })}
              </View>
            </Dropdown>

            {/* Timing */}
            <Dropdown
              label={t("community.filters.timing")}
              display={timingText(tmpTimeFilter)}
              open={timeOpen}
              setOpen={(v) => {
                setTimeOpen(v);
                if (v) {
                  setCatOpen(false);
                  setDistOpen(false);
                  setPriceOpen(false);
                }
              }}
            >
              <View style={styles.rowSpace}>
                {(["today", "week", "upcoming"] as TimeFilter[]).map((tOpt) => (
                  <Chip key={tOpt} active={tmpTimeFilter === tOpt} onPress={() => setTmpTimeFilter(tOpt)}>
                    {timingText(tOpt)}
                  </Chip>
                ))}
              </View>
            </Dropdown>

            {/* Distance */}
            <Dropdown
              label={t("community.filters.distance")}
              display={distanceText(tmpDistanceSort)}
              open={distOpen}
              setOpen={(v) => {
                setDistOpen(v);
                if (v) {
                  setCatOpen(false);
                  setTimeOpen(false);
                  setPriceOpen(false);
                }
              }}
            >
              <View style={styles.rowSpace}>
                {(["near", "far", "none"] as DistanceSort[]).map((d) => (
                  <Chip key={d} active={tmpDistanceSort === d} onPress={() => setTmpDistanceSort(d)}>
                    {distanceText(d)}
                  </Chip>
                ))}
              </View>
            </Dropdown>

            {/* Pricing */}
            <Dropdown
              label={t("community.filters.price")}
              display={
                tmpPricingFilter === "free"
                  ? t("community.price.freeOnly")
                  : tmpPricingFilter === "paid"
                  ? t("community.price.paidOnly")
                  : t("community.price.all")
              }
              open={priceOpen}
              setOpen={(v) => {
                setPriceOpen(v);
                if (v) {
                  setCatOpen(false);
                  setTimeOpen(false);
                  setDistOpen(false);
                }
              }}
            >
              <View style={styles.rowSpace}>
                <Chip active={tmpPricingFilter === "all"} onPress={() => setTmpPricingFilter("all")}>
                  {t("community.price.all")}
                </Chip>
                <Chip active={tmpPricingFilter === "free"} onPress={() => setTmpPricingFilter("free")}>
                  {t("community.price.freeOnly")}
                </Chip>
                <Chip active={tmpPricingFilter === "paid"} onPress={() => setTmpPricingFilter("paid")}>
                  {t("community.price.paidOnly")}
                </Chip>
              </View>
            </Dropdown>

            {/* Actions */}
            <View style={[styles.rowSpace, { marginTop: 14 }]}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#6B7280" }]}
                onPress={() => {
                  setTmpCategories([]);
                  setTmpTimeFilter("upcoming");
                  setTmpDistanceSort("near");
                  setTmpPricingFilter("all");
                }}
              >
                <AppText variant="button" weight="800" color="#FFF">
                  {t("community.filters.reset")}
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: APPLY }]}
                onPress={() => {
                  setCategories(tmpCategories);
                  setTimeFilter(tmpTimeFilter);
                  setDistanceSort(tmpDistanceSort);
                  setPricingFilter(tmpPricingFilter);
                  setPage(1);
                  setFiltersOpen(false);
                }}
              >
                <AppText variant="button" weight="800" color="#FFF">
                  {t("community.filters.apply")}
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  controls: { padding: 12, paddingTop: Platform.OS === "ios" ? 8 : 4 },

  searchRow: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    marginBottom: 10,
    gap: 8,
  },
  input: { flex: 1, paddingVertical: 8, paddingHorizontal: 6 },
  searchBtn: {
    backgroundColor: SEARCH,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  summaryRow: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignSelf: "flex-start",
    backgroundColor: "#EEF2FF",
  },

  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 12,
    marginBottom: 10,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },

  metaRowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
    gap: 8,
  },
  feeTag: {
    color: "#E57373",
    flexShrink: 0,
    marginLeft: 8,
  },

  expandBody: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: CARD_BORDER,
    gap: 10,
  },

  paginationBar: {
    marginTop: 8,
    marginBottom: 16,
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pageIcon: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  pageDisabled: { opacity: 0.5 },
  pageNums: { flexDirection: "row", alignItems: "center", gap: 14 },
  pageNumBtn: { paddingHorizontal: 2, paddingVertical: 2 },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  dropdownPanel: {
    position: "absolute",
    top: Platform.OS === "ios" ? 100 : 84,
    right: 12,
    left: 12,
    backgroundColor: "#FFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  dropHeader: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dropBody: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: CARD_BORDER,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    padding: 10,
    backgroundColor: "#FAFAFA",
  },

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },

  chip: {
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#FFF",
  },
  chipActive: { backgroundColor: DARK, borderColor: DARK },

  rowSpace: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 },

  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", marginHorizontal: 4 },
});
