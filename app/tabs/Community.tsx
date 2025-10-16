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
  Dimensions,
  FlatList,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  UIManager,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/AuthProvider";

import AppText from "../../src/components/AppText";
import FilterSheet, { type ChipOpt, type FilterSection } from "../../src/components/FilterSheet";
import Pagination from "../../src/components/Pagination";
import SearchBar from "../../src/components/SearchBar";
import SummaryChip from "../../src/components/SummaryChip";
import TopBar, { type LangCode } from "../../src/components/TopBar";
import { presentNow } from "../../src/lib/notifications";
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
const BG = "#F8FAFC";
const CARD_BORDER = "#E5E7EB";
const DARK = "#111827";
const MIN_SHEET_RATIO = 0.38;
const MAX_SHEET_RATIO = 0.68;

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

const parseEventStart = (evt: EventRow): Date | null => {
  if (!evt.start_date) return null;
  const [y, m, d] = evt.start_date.split("-").map(Number);
  let hh = 9,
    mm = 0;
  if (evt.start_time) {
    const [h, min] = evt.start_time.split(":").map(Number);
    if (!isNaN(h)) hh = h;
    if (!isNaN(min)) mm = min;
  }
  const dt = new Date(y, (m || 1) - 1, d || 1, hh, mm, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
};

const ensureNotifPermission = async (t: (k: string, p?: any) => string): Promise<boolean> => {
  const { status: cur } = await Notifications.getPermissionsAsync();
  if (cur === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(t("navigation.reminders.permTitle"), t("navigation.reminders.permBody"));
    return false;
  }
  return true;
};

const isEventScheduled = (
  evt: EventRow,
  list: { id?: string; title?: string | null; at?: string; cc?: string | null }[]
) => {
  if (!evt?.id) return false;
  return list.some((r) => r.id === evt.id);
};

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

  const [headerH, setHeaderH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [footerH, setFooterH] = useState(0);
  const winH = Dimensions.get("window").height;
  const MIN_SHEET = Math.round(winH * MIN_SHEET_RATIO);
  const MAX_SHEET = Math.round(winH * MAX_SHEET_RATIO);
  const natural = Math.round(headerH + contentH + footerH);
  const sheetHeight = Math.max(MIN_SHEET, Math.min(natural, MAX_SHEET));

  const params = useLocalSearchParams<{ openEventId?: string; openEventEventId?: string }>();
  const hasConsumedDeepLinkRef = useRef(false);
  const geoCache = useRef<Map<string, LatLng>>(new Map());

  const smoothLayout = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

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

  const kmStr = (m?: number | null) => (m == null ? "" : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);

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

      let ev = events.find((e) => e.id === idOrEventId || e.event_id === idOrEventId) || null;

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

      let withDist = (data || []).map((r) => ({ ...r })) as (EventRow & { _distance?: number | null })[];

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
        const ta = toDateValue(a),
          tb = toDateValue(b);
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
        return { id: n.identifier, title: n.content?.title, body: n.content?.body, when };
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

  const scheduleReminderForEvent = async (evt: EventRow) => {
    const ok = await ensureNotifPermission(t);
    if (!ok) return;

    const startsAt = parseEventStart(evt);
    if (!startsAt) return;

    const triggerDate = new Date(startsAt.getTime() - 60 * 60 * 1000);
    if (triggerDate.getTime() <= Date.now()) {
      await presentNow({
        title: evt.title || t("navigation.reminders.untitled"),
        body: t("community.notifs.noneScheduled"),
      });
      return;
    }

    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: evt.title ?? t("navigation.reminders.untitled"),
        body: t("navigation.reminders.fireBody"),
        data: { eventId: evt.id ?? evt.event_id, startsAt: startsAt.toISOString() },
        sound: true,
      },
      trigger: triggerDate as any,
    });

    try {
      const raw = (await AsyncStorage.getItem(REMINDERS_KEY)) || "[]";
      const arr: any[] = JSON.parse(raw);
      arr.push({
        id: evt.id,
        title: evt.title,
        at: startsAt.toISOString(),
        remindAt: triggerDate.toISOString(),
        notifId,
        cc: null,
      });
      await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(arr));
    } catch {}

    await refreshNotifications();
    await presentNow({
      title: evt.title ?? t("navigation.reminders.untitled"),
      body: t("navigation.reminders.scheduledBody", { when: triggerDate.toLocaleString() }),
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const timingText = (tf: TimeFilter) =>
    tf === "today" ? t("community.timing.today") : tf === "week" ? t("community.timing.week") : t("community.timing.upcoming");

  const priceText = (pf: PricingFilter) =>
    pf === "free" ? t("community.price.freeOnly") : pf === "paid" ? t("community.price.paidOnly") : t("community.price.all");

  const distanceLabel =
    distanceFilter === "any"
      ? t("community.distance.anyDistance")
      : distanceFilter === "2"
      ? t("community.distance.le2")
      : distanceFilter === "5"
      ? t("community.distance.le5")
      : t("community.distance.le10");

  const selectedCatsLabel =
    categories.length > 0 ? categories.map((c) => catLabel(c as any, t)).join(", ") : t("community.all");

  const summaryItems = [selectedCatsLabel, timingText(timeFilter), distanceLabel, priceText(pricingFilter)];

  const onRegister = async (url?: string | null) => {
    if (!url) return Alert.alert(t("community.register"), t("community.noEvents"));
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Linking.openURL(url).catch(() => Alert.alert(t("community.register"), t("alerts.genericFailBody")));
    }
  };

  const onDirections = (evt: EventRow) => {
    setDetailsOpen(false);
    const q = (evt.address && evt.address.trim()) || (evt.location_name && evt.location_name.trim());
    if (!q) return Alert.alert(t("community.getDirections"), t("alerts.genericFailBody"));

    router.push({
      pathname: "/tabs/Navigation",
      params: { presetQuery: q, autoStart: "1" }, // 👈 new
    });
  };

  const openNativeDirections = async (q: string) => {
    let latlng: LatLng | null = null;
    try {
      latlng = await geocode(q);
    } catch {}

    if (Platform.OS === "android") {
      const navTarget = latlng ? `${latlng.latitude},${latlng.longitude}` : q;
      const googleNavUrl = `google.navigation:q=${encodeURIComponent(navTarget)}&mode=d`;
      const geoFallback = latlng
        ? `geo:${latlng.latitude},${latlng.longitude}?q=${latlng.latitude},${latlng.longitude}(${encodeURIComponent(q)})`
        : `geo:0,0?q=${encodeURIComponent(q)}`;

      try {
        const canNav = await Linking.canOpenURL("google.navigation:");
        if (canNav) {
          await Linking.openURL(googleNavUrl);
          return;
        }
      } catch {}
      await Linking.openURL(geoFallback);
      return;
    }

    const appleTarget = latlng ? `${latlng.latitude},${latlng.longitude}` : q;
    const gmapsUrl = `comgooglemaps://?daddr=${encodeURIComponent(appleTarget)}&directionsmode=driving`;
    const appleUrl = `http://maps.apple.com/?daddr=${encodeURIComponent(appleTarget)}&dirflg=d`;

    try {
      const canG = await Linking.canOpenURL("comgooglemaps://");
      if (canG) {
        await Linking.openURL(gmapsUrl);
        return;
      }
    } catch {}
    await Linking.openURL(appleUrl);
  };

  const openDetails = (e: EventRow) => {
    setSelectedEvent(e);
    setDetailsOpen(true);
  };

  const RenderCard = ({ item }: { item: EventRow & { _distance?: number | null } }) => {
    const scheduledAlready = isEventScheduled(item, ccReminders);
    const timePart = [formatTime(item.start_time), formatTime(item.end_time)].filter(Boolean).join(" - ") || "—";
    const feePart = item.fee?.trim() || t("community.priceOptions.free");
    const distPart = kmStr(item._distance);

    return (
      <View style={styles.card}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable onPress={() => openDetails(item)} style={{ flex: 1 }}>
            <AppText variant="title" weight="800" style={{ marginBottom: 2 }}>
              {item.title}
            </AppText>

            <View style={styles.metaRow}>
              <AppText variant="label" color="#2563EB" weight="700">
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
                {item.start_date} · {timePart}
              </AppText>
              <AppText variant="label" weight="800" style={styles.feeTag}>
                {feePart}
              </AppText>
            </View>
          </Pressable>

          <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 8 }}>
            <TouchableOpacity
              hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
              onPress={() => {
                if (!scheduledAlready) {
                  scheduleReminderForEvent(item);
                } else {
                  presentNow({ title: item.title || "", body: t("community.notifs.alreadyScheduled") });
                }
              }}
              style={{ padding: 4, marginRight: 4 }}
              accessibilityLabel={t("navigation.actions.setReminder")}
            >
              <Ionicons
                name={scheduledAlready ? "notifications" : "notifications-outline"}
                size={20}
                color={scheduledAlready ? "#007AFF" : "#9CA3AF"}
              />
            </TouchableOpacity>

            <TouchableOpacity
              hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
              onPress={() => openDetails(item)}
              style={{ padding: 4 }}
            >
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const filterSections: FilterSection[] = [
    {
      id: "categories",
      type: "chips-multi",
      title: t("community.filters.categories"),
      options: (CATEGORIES as readonly string[]).map<ChipOpt>((c) => ({ key: c, label: catLabel(c as any, t) })),
      selected: tmpCategories,
      onToggle: (key) =>
        setTmpCategories((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key])),
    },
    {
      id: "time",
      type: "chips-single",
      title: t("community.filters.timing"),
      options: [
        { key: "today", label: t("community.timing.today") },
        { key: "week", label: t("community.timing.week") },
        { key: "upcoming", label: t("community.timing.upcoming") },
      ],
      selected: tmpTimeFilter,
      onSelect: (k) => setTmpTimeFilter(k as TimeFilter),
    },
    {
      id: "price",
      type: "chips-single",
      title: t("community.filters.price"),
      options: [
        { key: "all", label: t("community.price.all") },
        { key: "free", label: t("community.price.freeOnly") },
        { key: "paid", label: t("community.price.paidOnly") },
      ],
      selected: tmpPricingFilter,
      onSelect: (k) => setTmpPricingFilter(k as PricingFilter),
    },
    {
      id: "distance",
      type: "chips-single",
      title: t("community.filters.distance"),
      options: [
        { key: "any", label: t("community.distance.any") },
        { key: "2", label: t("community.distance.le2") },
        { key: "5", label: t("community.distance.le5") },
        { key: "10", label: t("community.distance.le10") },
      ],
      selected: tmpDistanceFilter,
      onSelect: (k) => setTmpDistanceFilter(k as DistanceFilter),
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <TopBar
        leftMode="back"
        backTo="/tabs/Activities"
        language={i18n.language as LangCode}
        setLanguage={setLang as (c: LangCode) => void}
        bgColor="#FFEE8C"
        includeTopInset
        barHeight={44}
        topPadding={2}
        title={t("community.title")}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/LogIn");
        }}
      />

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
          <Ionicons name={notifPanelOpen ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
        </Pressable>

        {notifPanelOpen && (
          <View style={styles.notifPanel}>
            <Pressable
              style={[
                styles.actionBtn,
                { backgroundColor: "#DC2626", marginBottom: 10, opacity: notifBusy ? 0.6 : 1, minHeight: 44, justifyContent: "center" },
              ]}
              onPress={clearAllNotifications}
              disabled={notifBusy}
            >
              <AppText variant="button" weight="800" color="#FFF">
                {t("community.notifs.clearAll")}
              </AppText>
            </Pressable>

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

      <View style={{ padding: 12 }}>
        <SearchBar
          value={keyword}
          placeholder={t("community.searchPlaceholder")}
          onChangeText={(txt) => {
            setKeyword(txt);
            setPage(1);
          }}
          onSubmit={() => setPage(1)}
          onPressFilter={() => {
            setTmpCategories(categories);
            setTmpTimeFilter(timeFilter);
            setTmpPricingFilter(pricingFilter);
            setTmpDistanceFilter(distanceFilter);
            setFiltersOpen(true);
          }}
        />

        <SummaryChip items={summaryItems} variant="indigo" style={{ marginTop: 8 }} />
      </View>

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
            <View style={{ paddingHorizontal: 12 }}>
              <Pagination page={page} total={totalPages} onChange={(p) => setPage(p)} />
            </View>
          ) : (
            <View />
          )
        }
      />

      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        sections={filterSections}
        onReset={() => {
          setTmpCategories([]);
          setTmpTimeFilter("upcoming");
          setTmpPricingFilter("all");
          setTmpDistanceFilter("any");
        }}
        onApply={() => {
          setCategories(tmpCategories);
          setTimeFilter(tmpTimeFilter);
          setPricingFilter(tmpPricingFilter);
          setDistanceFilter(tmpDistanceFilter);
          setPage(1);
          setFiltersOpen(false);
        }}
        title={t("community.filters.title")}
        labels={{ reset: t("community.filters.reset"), apply: t("community.filters.apply") }}
      />

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
          <View style={[styles.detailsCard, { height: sheetHeight }]}>
            <View
              style={styles.detailsHeader}
              onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
            >
              <AppText variant="title" weight="900" style={{ marginBottom: 6 }}>
                {selectedEvent.title}
              </AppText>

              {!!selectedEvent.location_name && (
                <AppText variant="label" color="#374151" style={{ marginBottom: 6 }}>
                  {selectedEvent.location_name}
                </AppText>
              )}

              <View style={{ flexDirection: "row", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                {!!selectedEvent.start_date && (
                  <View style={styles.pill}>
                    <AppText variant="caption" weight="800">{selectedEvent.start_date}</AppText>
                  </View>
                )}
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

              {([formatTime(selectedEvent.start_time), formatTime(selectedEvent.end_time)].filter(Boolean).join(" - ") ||
                "") && (
                <AppText variant="caption" color="#6B7280">
                  {[formatTime(selectedEvent.start_time), formatTime(selectedEvent.end_time)]
                    .filter(Boolean)
                    .join(" - ") || "—"}
                </AppText>
              )}
            </View>

            <ScrollView
              style={styles.detailsScroll}
              contentContainerStyle={styles.detailsScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              <View onLayout={(e) => setContentH(e.nativeEvent.layout.height)}>
                <AppText variant="body" color="#111827">
                  {selectedEvent.description || t("community.details")}
                </AppText>
              </View>
            </ScrollView>

            <View
              style={styles.detailsFooter}
              onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
            >
              <View style={styles.actionsRow}>
                {!!selectedEvent.registration_link && (
                  <TouchableOpacity
                    style={[styles.btnBase, styles.halfBtn, { backgroundColor: DARK, marginRight: 8 }]}
                    onPress={() => onRegister(selectedEvent.registration_link)}
                  >
                    <AppText variant="button" weight="800" color="#FFF">
                      {t("community.register")}
                    </AppText>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[
                    styles.btnBase,
                    styles.halfBtn,
                    { backgroundColor: "#007aff" },
                    !selectedEvent.registration_link && { marginLeft: 0 },
                  ]}
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
  notifPanel: { marginTop: 8, backgroundColor: "#FFF", borderRadius: 12, borderWidth: 1, borderColor: CARD_BORDER, padding: 12 },

  card: { backgroundColor: "#FFF", borderRadius: 16, borderWidth: 1, borderColor: CARD_BORDER, padding: 12, marginBottom: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  metaRowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2, gap: 8 },
  feeTag: { color: "#E57373", flexShrink: 0, marginLeft: 8 },

  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.25)" },
  detailsCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    backgroundColor: "#FFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -6 },
  },

  detailsHeader: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CARD_BORDER,
    backgroundColor: "#FFF",
  },

  detailsScroll: { flex: 1 },
  detailsScrollContent: { paddingHorizontal: 14, paddingVertical: 12 },

  detailsFooter: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CARD_BORDER,
    backgroundColor: "#FFF",
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

  actionBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  actionsRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  btnBase: { minHeight: 48, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  halfBtn: { flex: 1 },
});
