import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  BackHandler,
  FlatList,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  UIManager,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/AuthProvider";

import AppText from "../../src/components/AppText";
import TopBar, { type LangCode } from "../../src/components/TopBar";
import { supabase } from "../../src/lib/supabase";

type EventRow = {
  id?: string;
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

const PAGE_SIZE = 5;
const SEARCH = "#111827";
const BG = "#F8FAFC";
const CARD_BORDER = "#E5E7EB";
const DARK = "#111827";

const GOOGLE_WEB_API_KEY = "AIzaSyDaNhQ7Ah-mlf2j4qHZTjXgtzrP-uBokGs";
const REMINDERS_KEY = "cc:reminders";

type TimeFilter = "today" | "week" | "upcoming";
type PricingFilter = "all" | "free" | "paid";
type DistanceFilter = "any" | "2" | "5" | "10";

type ScheduledLocal =
  | { id: string; title?: string; body?: string; when?: Date }
  | { id: string; title?: string; body?: string; when?: undefined };

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

const CAT_KEY = {
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
} as const;

const catLabel = (c: (typeof CATEGORIES)[number], t: (k: string, p?: any) => string) =>
  t(`community.categories.${CAT_KEY[c as keyof typeof CAT_KEY]}`);

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function CommunityScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { t, i18n } = useTranslation();

  const listRef = useRef<FlatList<any>>(null);

  const setLang = async (code: LangCode) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  const [myLoc, setMyLoc] = useState<LatLng | null>(null);

  const [keyword, setKeyword] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");
  const [pricingFilter, setPricingFilter] = useState<PricingFilter>("all");
  const [distanceFilter, setDistanceFilter] = useState<DistanceFilter>("any");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tmpCategories, setTmpCategories] = useState<string[]>([]);
  const [tmpTimeFilter, setTmpTimeFilter] = useState<TimeFilter>("upcoming");
  const [tmpPricingFilter, setTmpPricingFilter] = useState<PricingFilter>("all");
  const [tmpDistanceFilter, setTmpDistanceFilter] = useState<DistanceFilter>("any");

  const [events, setEvents] = useState<(EventRow & { _distance?: number | null })[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);

  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [ccReminders, setCcReminders] = useState<
    { id?: string; title?: string | null; at?: string; cc?: string | null }[]
  >([]);
  const [scheduled, setScheduled] = useState<ScheduledLocal[]>([]);
  const [notifBusy, setNotifBusy] = useState(false);

  const params = useLocalSearchParams<{ openEventId?: string; openEventEventId?: string }>();
  const hasConsumedDeepLinkRef = useRef(false);

  const geoCache = useRef<Map<string, LatLng>>(new Map());

  const smoothLayout = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

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
  }, [page, keyword, categories, timeFilter, pricingFilter, distanceFilter, i18n.language]);

  useFocusEffect(
    useCallback(() => {
      refreshNotifications();
      return () => {};
    }, [])
  );

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [page]);

  const handleScrollBegin = () => {
    if (notifPanelOpen) {
      smoothLayout();
      setNotifPanelOpen(false);
    }
  };

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
    if (!q.trim()) return null;
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

  const distanceOk = (meters?: number | null) => {
    if (meters == null || distanceFilter === "any") return true;
    const km = meters / 1000;
    if (distanceFilter === "2") return km <= 2;
    if (distanceFilter === "5") return km <= 5;
    if (distanceFilter === "10") return km <= 10;
    return true;
  };

  const clearOpenParams = useCallback(() => {
    try {
      router.replace({ pathname: "/tabs/Community" });
    } catch {}
  }, [router]);

  const openEventByAnyId = useCallback(
    async (idOrEventId: string | undefined | null) => {
      if (!idOrEventId) return;
      if (hasConsumedDeepLinkRef.current) return;
      hasConsumedDeepLinkRef.current = true;

      let ev =
        events.find((e) => e.id === idOrEventId || e.event_id === idOrEventId) || null;

      if (!ev) {
        const { data } = await supabase
          .from("events")
          .select("*")
          .or(`id.eq.${idOrEventId},event_id.eq.${idOrEventId}`)
          .limit(1)
          .maybeSingle();
        if (data) ev = data as EventRow;
      }

      if (ev) {
        setSelectedEvent(ev);
        setDetailsOpen(true);
        setTimeout(clearOpenParams, 0);
      } else {
        setTimeout(clearOpenParams, 0);
      }
    },
    [events, clearOpenParams]
  );

  useFocusEffect(
    useCallback(() => {
      const anyId = params.openEventId ?? params.openEventEventId;
      if (anyId) openEventByAnyId(anyId);
      return () => {};
    }, [params.openEventId, params.openEventEventId, openEventByAnyId])
  );

  useEffect(() => {
    const anyId = params.openEventId ?? params.openEventEventId;
    if (anyId && events.length) openEventByAnyId(anyId);
  }, [events, params.openEventId, params.openEventEventId, openEventByAnyId]);

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
      if (categories.length > 0) query = query.in("category", categories);
      if (from) query = query.gte("start_date", from);
      if (to) query = query.lte("start_date", to);

      if (pricingFilter === "free") {
        query = query.or("fee.is.null,fee.ilike.*free*");
      } else if (pricingFilter === "paid") {
        query = query.not("fee", "is", null).not("fee", "ilike", "*free*");
      }

      const start = (page - 1) * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;
      const { data, count, error } = await query.range(start, end);
      if (error) throw error;

      let withDist = (data || []).map((r) => ({ ...r })) as (EventRow & {
        _distance?: number | null;
      })[];

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

      withDist = withDist.filter((r) => distanceOk(r._distance));

      const toDateValue = (r: EventRow) => {
        const t = r.start_time ? r.start_time : "23:59:59";
        return new Date(`${r.start_date}T${t}`).getTime();
      };
      withDist.sort((a, b) => {
        const ta = toDateValue(a);
        const tb = toDateValue(b);
        if (ta !== tb) return ta - tb;
        const da = a._distance ?? Number.POSITIVE_INFINITY;
        const db = b._distance ?? Number.POSITIVE_INFINITY;
        return da - db;
      });

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

  const loadCcReminders = useCallback(async () => {
    try {
      const raw = (await AsyncStorage.getItem(REMINDERS_KEY)) || "[]";
      const arr = JSON.parse(raw);
      setCcReminders(Array.isArray(arr) ? arr : []);
    } catch {
      setCcReminders([]);
    }
  }, []);

  const loadScheduledLocals = useCallback(async () => {
    try {
      const arr = await Notifications.getAllScheduledNotificationsAsync();
    const mapped: ScheduledLocal[] = arr.map((n) => {
        const tr: any = n.trigger;
        const when: Date | undefined = tr?.date != null ? new Date(tr.date) : undefined;
        return {
          id: n.identifier,
          title: n.content?.title,
          body: n.content?.body,
          when,
        };
      });
      setScheduled(mapped);
    } catch {
      setScheduled([]);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    await Promise.all([loadCcReminders(), loadScheduledLocals()]);
  }, [loadCcReminders, loadScheduledLocals]);

  const clearAllNotifications = async () => {
    setNotifBusy(true);
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      await AsyncStorage.removeItem(REMINDERS_KEY);
      await refreshNotifications();
      Alert.alert("Cleared", "All scheduled notifications were cancelled.");
    } finally {
      setNotifBusy(false);
    }
  };

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

  const goFirst = () => setPage(1);
  const goLast = () => setPage(totalPages);
  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1));
  const goTo = (n: number) => setPage(n);

  const timingText = (tf: TimeFilter) =>
    tf === "today" ? t("community.timing.today")
      : tf === "week" ? t("community.timing.week")
      : t("community.timing.upcoming");

  const priceText = (pf: PricingFilter) =>
    pf === "free" ? t("community.price.freeOnly")
      : pf === "paid" ? t("community.price.paidOnly")
      : t("community.price.all");

  const distanceLabel =
    distanceFilter === "any"
      ? t("community.distance.anyDistance")
      : distanceFilter === "2"
        ? t("community.distance.le2")
        : distanceFilter === "5"
          ? t("community.distance.le5")
          : t("community.distance.le10");

  const selectedCatsLabel =
    categories.length > 0
      ? categories.map((c) => catLabel(c as any, t)).join(", ")
      : t("community.all");

  const summaryText =
    categories.length ||
    timeFilter !== "upcoming" ||
    pricingFilter !== "all" ||
    distanceFilter !== "any"
      ? `${selectedCatsLabel} · ${timingText(timeFilter)} · ${distanceLabel} · ${priceText(
          pricingFilter
        )}`
      : t("community.sortSummary.default");

  const onRegister = async (url?: string | null) => {
    if (!url) return Alert.alert(t("community.register"), t("community.noEvents"));
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Linking.openURL(url).catch(() => {
        Alert.alert(t("community.register"), t("alerts.genericFailBody"));
      });
    }
  };

  const onDirections = (evt: EventRow) => {
    setDetailsOpen(false);
    const q = (evt.address && evt.address.trim()) || (evt.location_name && evt.location_name.trim());
    if (!q) return Alert.alert(t("community.getDirections"), t("alerts.genericFailBody"));
    router.push({ pathname: "/tabs/Navigation", params: { presetQuery: q } });
  };

  const openDetails = (e: EventRow) => {
    setSelectedEvent(e);
    setDetailsOpen(true);
  };

  const RenderCard = ({ item }: { item: EventRow & { _distance?: number | null } }) => {
    const timePart =
      [formatTime(item.start_time), formatTime(item.end_time)].filter(Boolean).join(" - ") || "—";
    const feePart = item.fee?.trim() || t("community.priceOptions.free");
    const distPart = kmStr(item._distance);

    return (
      <View style={styles.card}>
        <Pressable
          onPress={() => openDetails(item)}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          <View style={{ flex: 1 }}>
            <AppText variant="title" weight="800" style={{ marginBottom: 2 }}>
              {item.title}
            </AppText>

            {/* Location + distance */}
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

            {/* Date + time + fee */}
            <View style={styles.metaRowBetween}>
              <AppText variant="label" color="#111827" weight="700" style={{ flexShrink: 1 }}>
                {item.start_date} · {timePart}
              </AppText>
              <AppText variant="label" weight="800" style={styles.feeTag}>
                {feePart}
              </AppText>
            </View>
          </View>

          <TouchableOpacity
            hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
            onPress={() => openDetails(item)}
            style={{ marginLeft: 8, padding: 4 }}
          >
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={setLang as (c: LangCode) => void}
        bgColor="#FFEE8C"
        includeTopInset={true}
        barHeight={44}
        topPadding={2}
        title={t("community.title")}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/LogIn");
        }}
      />

      {/* Notifications Panel */}
      <View style={styles.notifWrap}>
        <Pressable
          style={styles.notifBar}
          onPress={() => {
            smoothLayout();
            setNotifPanelOpen((v) => {
              const next = !v;
              if (next) refreshNotifications();
              return next;
            });
          }}
          accessibilityRole="button"
        >
          <AppText variant="label" weight="800">
            {t("community.notifs.panelTitle")}
          </AppText>
          <Ionicons
            name={notifPanelOpen ? "chevron-up" : "chevron-down"}
            size={16}
            color="#6B7280"
          />
        </Pressable>

        {notifPanelOpen && (
          <View style={styles.notifPanel}>
            <Pressable
              style={[
                styles.actionBtn,
                {
                  backgroundColor: "#DC2626",
                  marginBottom: 10,
                  opacity: notifBusy ? 0.6 : 1,
                  minHeight: 44,
                  justifyContent: "center",
                },
              ]}
              onPress={clearAllNotifications}
              disabled={notifBusy}
            >
              <AppText variant="button" weight="800" color="#FFF">
                {t("community.notifs.clearAll")}
              </AppText>
            </Pressable>

            {/* In-app upcoming reminders */}
            <View style={{ marginTop: 2 }}>
              <AppText variant="label" weight="700" color="#374151">
                {t("community.notifs.inAppUpcoming")}
              </AppText>
              {ccReminders.length === 0 ? (
                <AppText variant="caption" color="#6B7280" style={{ marginTop: 6 }}>
                  {t("community.notifs.noneScheduled")}
                </AppText>
              ) : (
                <View style={{ marginTop: 6, gap: 6 }}>
                  {ccReminders.map((r, idx) => (
                    <View key={`${r.id ?? "x"}-${idx}`} style={styles.reminderRow}>
                      <Ionicons name="notifications-outline" size={16} color="#374151" />
                      <AppText variant="caption" weight="700" style={{ flex: 1 }}>
                        {r.title || t("community.notifs.event")}
                        {r.cc ? ` — ${r.cc}` : ""}
                      </AppText>
                      <AppText variant="caption" color="#6B7280">
                        {r.at ? new Date(r.at).toLocaleString() : ""}
                      </AppText>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* All scheduled local notifications */}
            <View style={{ marginTop: 12 }}>
              <AppText variant="label" weight="700" color="#374151">
                {t("community.notifs.deviceScheduled")}
              </AppText>
              {scheduled.length === 0 ? (
                <AppText variant="caption" color="#6B7280" style={{ marginTop: 6 }}>
                  {t("community.notifs.noneScheduled")}
                </AppText>
              ) : (
                <View style={{ marginTop: 6, gap: 6 }}>
                  {scheduled.map((n) => (
                    <View key={n.id} style={styles.reminderRow}>
                      <Ionicons name="alarm-outline" size={16} color="#374151" />
                      <AppText variant="caption" weight="700" style={{ flex: 1 }}>
                        {n.title || t("community.notifs.reminder")}
                        {n.body ? ` — ${n.body}` : ""}
                      </AppText>
                      <AppText variant="caption" color="#6B7280">
                        {n.when ? n.when.toLocaleString() : "—"}
                      </AppText>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Search + summary */}
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

        {/* Summary chip */}
        <Pressable
          style={styles.summaryRow}
          onPress={() => {
            setTmpCategories(categories);
            setTmpTimeFilter(timeFilter);
            setTmpPricingFilter(pricingFilter);
            setTmpDistanceFilter(distanceFilter);
            setFiltersOpen(true);
          }}
        >
          <AppText variant="caption" color="#6B7280" numberOfLines={1}>
            {summaryText} {"  ▼"}
          </AppText>
        </Pressable>
      </View>

      {/* List */}
      <FlatList
        ref={listRef}
        data={events}
        keyExtractor={(it) => it.event_id}
        renderItem={RenderCard}
        contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
        ListEmptyComponent={
          <View style={{ padding: 16 }}>
            <AppText variant="label" color="#6B7280">
              {t("community.noEvents")}
            </AppText>
          </View>
        }
        refreshing={loading}
        onRefresh={() => fetchEvents()}
        onScrollBeginDrag={handleScrollBegin}
        ListFooterComponent={
          totalPages > 1 ? (
            <View style={styles.paginationBar}>
              {/* First */}
              <Pressable
                accessibilityRole="button"
                onPress={goFirst}
                disabled={page === 1}
                style={[styles.pageIcon, page === 1 && styles.pageDisabled]}
              >
                <AppText variant="button" weight="800" color={page === 1 ? "#9CA3AF" : DARK}>
                  «
                </AppText>
              </Pressable>

              {/* Prev */}
              <Pressable
                accessibilityRole="button"
                onPress={goPrev}
                disabled={page === 1}
                style={[styles.pageIcon, page === 1 && styles.pageDisabled]}
              >
                <AppText variant="button" weight="800" color={page === 1 ? "#9CA3AF" : DARK}>
                  ‹
                </AppText>
              </Pressable>

              {/* Numbers */}
              <View style={styles.pageNums}>
                {pages.map((n) => (
                  <Pressable key={n} onPress={() => goTo(n)} style={styles.pageNumBtn} disabled={n === page}>
                    <AppText
                      variant="label"
                      weight={n === page ? "900" : "700"}
                      color={n === page ? DARK : "#9CA3AF"}
                    >
                      {n}
                    </AppText>
                  </Pressable>
                ))}
              </View>

              {/* Next */}
              <Pressable
                accessibilityRole="button"
                onPress={goNext}
                disabled={page >= totalPages}
                style={[styles.pageIcon, page >= totalPages && styles.pageDisabled]}
              >
                <AppText variant="button" weight="800" color={page >= totalPages ? "#9CA3AF" : DARK}>
                  ›
                </AppText>
              </Pressable>

              {/* Last */}
              <Pressable
                accessibilityRole="button"
                onPress={goLast}
                disabled={page >= totalPages}
                style={[styles.pageIcon, page >= totalPages && styles.pageDisabled]}
              >
                <AppText variant="button" weight="800" color={page >= totalPages ? "#9CA3AF" : DARK}>
                  »
                </AppText>
              </Pressable>
            </View>
          ) : (
            <View />
          )
        }
      />

      {/* Filters Bottom Sheet */}
      <Modal
        visible={filtersOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFiltersOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setFiltersOpen(false)}>
          <View style={styles.modalBackdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.filtersCard}>
          <AppText variant="title" weight="900" style={{ marginBottom: 10 }}>
            {t("community.filters.title")}
          </AppText>

          {/* Categories chips */}
          <AppText variant="label" color="#6B7280" style={{ marginBottom: 6 }}>
            {t("community.filters.categories")}
          </AppText>
          <View style={styles.rowWrap}>
            {CATEGORIES.map((c) => {
              const active = tmpCategories.includes(c);
              return (
                <Pressable
                  key={c}
                  onPress={() =>
                    setTmpCategories((prev) =>
                      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                    )
                  }
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <AppText variant="button" weight="800" color={active ? "#FFF" : DARK}>
                    {catLabel(c, t)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Timing chips */}
          <AppText variant="label" color="#6B7280" style={{ marginTop: 12, marginBottom: 6 }}>
            {t("community.filters.timing")}
          </AppText>
          <View style={styles.rowWrap}>
            {(["today", "week", "upcoming"] as TimeFilter[]).map((opt) => {
              const active = tmpTimeFilter === opt;
              return (
                <Pressable
                  key={opt}
                  onPress={() => setTmpTimeFilter(opt)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <AppText variant="button" weight="800" color={active ? "#FFF" : DARK}>
                    {opt === "today"
                      ? t("community.timing.today")
                      : opt === "week"
                        ? t("community.timing.week")
                        : t("community.timing.upcoming")}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Price chips */}
          <AppText variant="label" color="#6B7280" style={{ marginTop: 12, marginBottom: 6 }}>
            {t("community.filters.price")}
          </AppText>
          <View style={styles.rowWrap}>
            {(["all", "free", "paid"] as PricingFilter[]).map((opt) => {
              const active = tmpPricingFilter === opt;
              return (
                <Pressable
                  key={opt}
                  onPress={() => setTmpPricingFilter(opt)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <AppText variant="button" weight="800" color={active ? "#FFF" : DARK}>
                    {opt === "all"
                      ? t("community.price.all")
                      : opt === "free"
                        ? t("community.price.freeOnly")
                        : t("community.price.paidOnly")}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Distance chips */}
          <AppText variant="label" color="#6B7280" style={{ marginTop: 12, marginBottom: 6 }}>
            {t("community.filters.distance")}
          </AppText>
          <View style={styles.rowWrap}>
            {([
              { key: "any", label: t("community.distance.any") },
              { key: "2", label: t("community.distance.le2") },
              { key: "5", label: t("community.distance.le5") },
              { key: "10", label: t("community.distance.le10") },
            ] as const).map(({ key, label }) => {
              const active = tmpDistanceFilter === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setTmpDistanceFilter(key as any)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <AppText variant="button" weight="800" color={active ? "#FFF" : DARK}>
                    {label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Actions */}
          <View style={[styles.rowSpace, { marginTop: 16 }]}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#6B7280" }]}
              onPress={() => {
                setTmpCategories([]);
                setTmpTimeFilter("upcoming");
                setTmpPricingFilter("all");
                setTmpDistanceFilter("any");
              }}
            >
              <AppText variant="button" weight="800" color="#FFF">
                {t("community.filters.reset")}
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#111827" }]}
              onPress={() => {
                setCategories(tmpCategories);
                setTimeFilter(tmpTimeFilter);
                setPricingFilter(tmpPricingFilter);
                setDistanceFilter(tmpDistanceFilter);
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

      {/* Details Modal */}
      <Modal
        visible={detailsOpen && !!selectedEvent}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailsOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDetailsOpen(false)}>
          <View style={styles.modalBackdrop} />
        </TouchableWithoutFeedback>

        {selectedEvent && (
          <View style={styles.detailsCard}>
            <AppText variant="title" weight="900" style={{ marginBottom: 6 }}>
              {selectedEvent.title}
            </AppText>

            <AppText variant="label" color="#374151" style={{ marginBottom: 6 }}>
              {selectedEvent.location_name || "—"}
            </AppText>

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <View style={styles.pill}>
                <AppText variant="caption" weight="800">
                  {selectedEvent.start_date}
                </AppText>
              </View>
              {!!selectedEvent.start_time && (
                <View style={styles.pill}>
                  <AppText variant="caption" weight="800">
                    {selectedEvent.start_time.slice(0, 5)}
                  </AppText>
                </View>
              )}
              {!!selectedEvent.fee && (
                <View style={[styles.pill, { backgroundColor: "#EEF2FF" }]}>
                  <AppText variant="caption" weight="900" color="#1D4ED8">
                    {selectedEvent.fee}
                  </AppText>
                </View>
              )}
            </View>

            <AppText variant="body" color="#111827" style={{ marginBottom: 12 }}>
              {selectedEvent.description || t("community.details")}
            </AppText>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {!!selectedEvent.registration_link && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: DARK }]}
                  onPress={() => onRegister(selectedEvent.registration_link)}
                >
                  <AppText variant="button" weight="800" color="#FFF">
                    {t("community.register")}
                  </AppText>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#a3491d" }]}
                onPress={() => onDirections(selectedEvent)}
              >
                <AppText variant="button" weight="800" color="#FFF">
                  {t("community.getDirections")}
                </AppText>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setDetailsOpen(false)}
              style={{ alignSelf: "center", marginTop: 10, padding: 8 }}
            >
              <AppText variant="button" color="#6B7280">
                {t("common.cancel")}
              </AppText>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  notifWrap: { paddingHorizontal: 12, paddingTop: Platform.OS === "ios" ? 8 : 4 },
  notifBar: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  notifPanel: {
    marginTop: 8,
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 12,
  },

  controls: { padding: 12 },

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

  chip: {
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#FFF",
  },
  chipActive: { backgroundColor: DARK, borderColor: DARK },

  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

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
  pageIcon: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  pageDisabled: { opacity: 0.5 },
  pageNums: { flexDirection: "row", alignItems: "center", gap: 14 },
  pageNumBtn: { paddingHorizontal: 2, paddingVertical: 2 },

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  filtersCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    backgroundColor: "#FFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -6 },
  },

  detailsCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    backgroundColor: "#FFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -6 },
  },

  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#F3F4F6" },

  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },

  rowSpace: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },

  actionBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
