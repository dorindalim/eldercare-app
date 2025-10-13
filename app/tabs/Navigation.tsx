import { Ionicons } from "@expo/vector-icons";
import polyline from "@mapbox/polyline";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, {
  Callout,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type MapMarker,
} from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import TopBar, { type LangCode } from "../../src/components/TopBar";
import { presentNow } from "../../src/lib/notifications";
import { supabase } from "../../src/lib/supabase";

import CLINIC_GEOJSON from "../../assets/data/CHASClinics.json";
import CC_GEOJSON from "../../assets/data/CommunityClubs.json";
import PARK_GEOJSON from "../../assets/data/Parks.json";

const GOOGLE_WEB_API_KEY = "AIzaSyDaNhQ7Ah-mlf2j4qHZTjXgtzrP-uBokGs";
const REMINDERS_KEY = "cc:reminders";

type LatLng = { latitude: number; longitude: number };

type POI = {
  id: string;
  name: string;
  coords: LatLng;
  postal?: string | null;
};

type CCEvent = {
  id: string;
  event_id: string | null;
  title: string | null;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  fee: string | null;
  registration_link: string | null;
  location_name: string | null;
  address: string | null;
  organizer: string | null;
};

type CategoryKey = "search" | "cc" | "clinics" | "parks";

export default function NavigationScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { t, i18n } = useTranslation();

  const setLang = async (code: LangCode) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  const [location, setLocation] = useState<LatLng | null>(null);
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState<LatLng | null>(null);

  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [steps, setSteps] = useState<
    { id: string; html: string; dist: string; endLoc: { lat: number; lng: number } }[]
  >([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepDistanceM, setStepDistanceM] = useState<number | null>(null);
  const [eta, setEta] = useState<{ duration: string; distance: string } | null>(null);
  const [mode, setMode] = useState<"driving" | "walking" | "bicycling" | "transit">("driving");
  const [navigating, setNavigating] = useState(false);
  const [showAllSteps, setShowAllSteps] = useState(false);

  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);

  const [category, setCategory] = useState<CategoryKey>("search");
  const [catMenuOpen, setCatMenuOpen] = useState(false);

  const [ccPOIs, setCcPOIs] = useState<POI[]>([]);
  const [clinicPOIs, setClinicPOIs] = useState<POI[]>([]);
  const [parkPOIs, setParkPOIs] = useState<POI[]>([]);

  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null);
  const [showPoiOptions, setShowPoiOptions] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetEvents, setSheetEvents] = useState<CCEvent[]>([]);
  const [sheetCcName, setSheetCcName] = useState<string>("");

  const [suggestions, setSuggestions] = useState<any[]>([]);

  const mapRef = useRef<MapView | null>(null);
  const markerRefs = useRef<Record<string, MapMarker | null>>({});
  const lastRouteRefreshRef = useRef(0);

  // remember the previous POI category so we can restore it after stopping nav
  const prevCategoryRef = useRef<CategoryKey>("search");

  const isExpoGo = Constants.appOwnership === "expo";
  const providerProp = isExpoGo ? undefined : PROVIDER_GOOGLE;

  const params = useLocalSearchParams();
  const presetQuery = params.presetQuery as string | undefined;
  const autoRanRef = useRef(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        setPermissionGranted(true);
        const pos = await Location.getCurrentPositionAsync({});
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } else {
        Alert.alert(t("navigation.search.permissionTitle"), t("navigation.search.permissionBody"));
      }
    })();
  }, [i18n.language]);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    if (navigating) {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          sub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
            (pos) => {
              const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
              setLocation(coords);

              // RATE-LIMIT route refresh to avoid quota blowups
              if (destination && Date.now() - lastRouteRefreshRef.current > 15000) {
                lastRouteRefreshRef.current = Date.now();
                fetchDirections(coords, destination, /*speak*/ false);
              }

              updateStepProgress(coords);
            }
          );
        }
      })();
    }
    return () => sub && sub.remove();
  }, [navigating, destination, mode, steps, currentStepIndex]);

  useEffect(() => {
    if (presetQuery && !autoRanRef.current) {
      autoRanRef.current = true;
      setQuery(presetQuery);
      searchDestination(presetQuery);
    }
  }, [presetQuery]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (query.length > 2 && location) {
        fetchAutocompleteSuggestions(query);
      }
    }, 400);
    return () => clearTimeout(debounce);
  }, [query, location]);

  const fetchAutocompleteSuggestions = async (input: string) => {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        input
      )}&key=${GOOGLE_WEB_API_KEY}&location=${location?.latitude ?? 1.3521}%2C${location?.longitude ?? 103.8198}&radius=10000`;
      const res = await fetch(url);
      const data = await res.json();
      setSuggestions(data.predictions || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSuggestionPress = async (suggestion: any) => {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${suggestion.place_id}&key=${GOOGLE_WEB_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.result) {
        const loc = data.result.geometry.location;
        const dest = { latitude: loc.lat, longitude: loc.lng };
        setQuery(suggestion.description);
        setSuggestions([]);
        setDestinationOnly(dest);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const hideAllCallouts = () => {
    Object.values(markerRefs.current).forEach((m) => {
      try {
        m?.hideCallout?.();
      } catch {}
    });
  };

  function extractFromDescription(desc?: string, key?: string) {
    if (!desc || !key) return undefined;
    const re = new RegExp(`<th>\\s*${key}\\s*<\\/th>\\s*<td>(.*?)<\\/td>`, "i");
    const m = desc.match(re);
    return m?.[1]?.replace(/<[^>]+>/g, "").trim();
  }

  function parseGeoJSONPoints(
    geojson: any,
    defaultName: string,
    kind: "clinic" | "cc" | "park"
  ): POI[] {
    if (!geojson || !Array.isArray(geojson.features)) return [];
    return geojson.features
      .map((f: any, idx: number) => {
        const geom = f?.geometry;
        const props = f?.properties ?? {};
        const desc = props.Description as string | undefined;

        let name: string | undefined;
        let postal: string | undefined;
        if (kind === "clinic") {
          name = extractFromDescription(desc, "HCI_NAME") || props.HCI_NAME || props.hci_name;
        } else if (kind === "cc") {
          name = extractFromDescription(desc, "NAME") || props.CC_NAME || props.cc_name;
          postal = extractFromDescription(desc, "ADDRESSPOSTALCODE");
        } else {
          name = props.NAME || props.Name || props.name;
        }
        if (!name) name = defaultName;
        if (!geom) return null;

        if (geom.type === "Point" && Array.isArray(geom.coordinates)) {
          const [lng, lat] = geom.coordinates;
          return {
            id: f.id?.toString?.() ?? `${kind}-${idx}`,
            name,
            coords: { latitude: lat, longitude: lng },
            postal: kind === "cc" ? (postal ?? null) : undefined,
          } as POI;
        }

        if (geom.type === "MultiPoint" && Array.isArray(geom.coordinates)) {
          return geom.coordinates.map(([lng, lat]: number[], j: number) => ({
            id: f.id?.toString?.() ?? `${kind}-${idx}-${j}`,
            name,
            coords: { latitude: lat, longitude: lng },
            postal: kind === "cc" ? (postal ?? null) : undefined,
          })) as POI[];
        }

        return null;
      })
      .flat()
      .filter(Boolean) as POI[];
  }

  useEffect(() => {
    try {
      setCcPOIs(parseGeoJSONPoints(CC_GEOJSON, "Community Club", "cc"));
    } catch {}
    try {
      setClinicPOIs(parseGeoJSONPoints(CLINIC_GEOJSON, "Clinic", "clinic"));
    } catch {}
    try {
      setParkPOIs(parseGeoJSONPoints(PARK_GEOJSON, "Park", "park"));
    } catch {}
  }, []);

  const activePOIs: POI[] = useMemo(() => {
    switch (category) {
      case "cc":
        return ccPOIs;
      case "clinics":
        return clinicPOIs;
      case "parks":
        return parkPOIs;
      default:
        return [];
    }
  }, [category, ccPOIs, clinicPOIs, parkPOIs]);

  const activeColor = useMemo(() => {
    switch (category) {
      case "cc":
        return "#8B5CF6";
      case "clinics":
        return "#10B981";
      case "parks":
        return "#F59E0B";
      default:
        return "#007AFF";
    }
  }, [category]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (activePOIs.length === 0) return;

    const latitudes = activePOIs.map((p) => p.coords.latitude);
    const longitudes = activePOIs.map((p) => p.coords.longitude);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const pad = 0.02;
    const region = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.01, maxLat - minLat + pad),
      longitudeDelta: Math.max(0.01, maxLng - minLng + pad),
    };
    mapRef.current.animateToRegion(region, 500);
  }, [category, activePOIs]);

  useEffect(() => {
    if (!mapRef.current || !location || navigating) return;
    try {
      mapRef.current.animateToRegion(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        600
      );
    } catch {}
  }, [location, navigating]);

  /** ---------------- SEARCH ---------------- */
  const searchDestination = async (override?: string) => {
    const q = (override ?? query).trim();
    if (!q) return Alert.alert(t("navigation.search.enterTitle"), t("navigation.search.enterBody"));
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        q
      )}&key=${GOOGLE_WEB_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.results?.length)
        return Alert.alert(t("navigation.search.notFoundTitle"), t("navigation.search.notFoundBody"));
      const loc = data.results[0].geometry.location;
      const dest = { latitude: loc.lat, longitude: loc.lng };
      setDestinationOnly(dest);
    } catch (e) {
      Alert.alert(t("common.error"), String(e));
    }
  };

  /** ---------------- ROUTING + TURN PROGRESS ---------------- */
  const fetchDirections = async (origin: LatLng, dest: LatLng, speak = true) => {
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${dest.latitude},${dest.longitude}&mode=${mode}&key=${GOOGLE_WEB_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.routes?.length) return;

      const route = data.routes[0];
      const pts = polyline.decode(route.overview_polyline.points);
      const coords = pts.map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
      setRouteCoords(coords);

      const leg = route.legs[0];
      setEta({ duration: leg.duration.text, distance: leg.distance.text });

      const mappedSteps = leg.steps.map((s: any, idx: number) => ({
        id: String(idx),
        html: s.html_instructions,
        dist: s.distance?.text ?? "",
        endLoc: {
          lat: s.end_location.lat,
          lng: s.end_location.lng,
        },
      }));
      setSteps(mappedSteps);

      // reset current step distance display
      setStepDistanceM(
        distanceMeters(origin, { latitude: mappedSteps[0].endLoc.lat, longitude: mappedSteps[0].endLoc.lng })
      );

      if (speak && mappedSteps.length) {
        Speech.speak(stripHtml(mappedSteps[0].html));
      }

      // fit once when route (re)computed
      if (mapRef.current && coords.length) {
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 80, right: 40, bottom: 220, left: 40 },
          animated: true,
        });
      }
    } catch (e) {
      Alert.alert(t("common.error"), String(e));
    }
  };

  const updateStepProgress = (pos: LatLng) => {
    if (!steps.length) return;

    const step = steps[currentStepIndex];
    const dist = distanceMeters(pos, { latitude: step.endLoc.lat, longitude: step.endLoc.lng });
    setStepDistanceM(dist);

    // advance when close to the end of this instruction
    const THRESHOLD_M = 25; // tweak as you like
    if (dist < THRESHOLD_M) {
      if (currentStepIndex < steps.length - 1) {
        const nextIndex = currentStepIndex + 1;
        setCurrentStepIndex(nextIndex);
        setTimeout(() => {
          const next = steps[nextIndex];
          Speech.speak(stripHtml(next.html));
        }, 100);
      } else {
        // arrived — fully clear nav state
        Speech.speak(t("navigation.search.arrived"));
        clearNavigation({ restoreCategory: true });
      }
    }
  };

  const fmtMeters = (m?: number | null) => {
    if (m == null) return "";
    if (m < 1000) return `${Math.max(1, Math.round(m))} m`;
    return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
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

  const stripHtml = (html: string) => html?.replace(/<[^>]+>/g, "") || "";

  const setDestinationOnly = (dest: LatLng) => {
    setShowPoiOptions(false);
    setSheetOpen(false);
    hideAllCallouts();

    setDestination(dest);
    setCurrentStepIndex(0);
    setRouteCoords([]);
    setSteps([]);
    setEta(null);
    setStepDistanceM(null);

    if (mapRef.current) {
      if (location) {
        mapRef.current.fitToCoordinates([location, dest], {
          edgePadding: { top: 80, right: 40, bottom: 200, left: 40 },
          animated: true,
        });
      } else {
        mapRef.current.animateToRegion(
          {
            latitude: dest.latitude,
            longitude: dest.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          500
        );
      }
    }

    // remember what category was active before switching to the "search" view
    prevCategoryRef.current = category;
    setCategory("search");
  };

  const startNavigation = () => {
    if (!location || !destination)
      return Alert.alert(t("navigation.search.enterTitle"), t("navigation.search.enterBody"));
    setNavigating(true);
    setCurrentStepIndex(0);
    lastRouteRefreshRef.current = 0; // ensure we refresh immediately
    fetchDirections(location, destination, /*speak*/ true);
    Speech.speak(t("navigation.search.started"));
  };

  /** fully clear nav + UI and optionally restore previous POI category */
  const clearNavigation = (opts?: { restoreCategory?: boolean }) => {
    setNavigating(false);
    setDestination(null);
    setRouteCoords([]);
    setSteps([]);
    setCurrentStepIndex(0);
    setEta(null);
    setStepDistanceM(null);
    setShowAllSteps(false);
    setShowPoiOptions(false);
    setSheetOpen(false);
    setSuggestions([]);
    setQuery("");

    if (opts?.restoreCategory) {
      setCategory(prevCategoryRef.current);
    }

    if (location && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        500
      );
    }
  };

  /** ---------------- CC events (unchanged) ---------------- */
  const parseEventStart = (evt: CCEvent): Date | null => {
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

  const ensureNotifPermission = async (): Promise<boolean> => {
    const { status: cur } = await Notifications.getPermissionsAsync();
    if (cur === "granted") return true;
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("navigation.reminders.permTitle"), t("navigation.reminders.permBody"));
      return false;
    }
    return true;
  };

  const scheduleReminder = async (evt: CCEvent) => {
    const ok = await ensureNotifPermission();
    if (!ok) return;

    const startsAt = parseEventStart(evt);
    if (!startsAt) return;

    const triggerDate = new Date(startsAt.getTime() - 60 * 60 * 1000);
    if (triggerDate.getTime() <= Date.now()) return;

    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: evt.title ?? t("navigation.reminders.untitled"),
        body: t("navigation.reminders.fireBody"),
        data: { eventId: evt.id, startsAt: startsAt.toISOString() },
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
        cc: sheetCcName,
      });
      await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(arr));
    } catch {}

    await presentNow({
      title: evt.title,
      body: t("navigation.reminders.scheduledBody", {
        when: triggerDate.toLocaleString(),
      }),
    });
  };

  const fetchCcActivities = async (p: POI) => {
    setSheetCcName(p.name);
    setSheetOpen(true);
    setSheetLoading(true);
    setSheetEvents([]);
    try {
      const { data, error } = await supabase.rpc("cc_events_for_pin", {
        p_name: p.name,
        p_postal: p.postal ?? null,
      });
      if (error) throw error;
      setSheetEvents((data || []) as CCEvent[]);
    } catch (e: any) {
      Alert.alert(t("community.title"), e?.message || t("community.noEvents"));
    } finally {
      setSheetLoading(false);
    }
  };

  const openPoiOptions = (p: POI) => {
    setSheetOpen(false);
    setSelectedPOI(p);
    setShowPoiOptions(true);
    setCatMenuOpen(false);
  };

  const closeSheetsForMapInteraction = () => {
    if (showPoiOptions) setShowPoiOptions(false);
    if (sheetOpen) setSheetOpen(false);
    if (catMenuOpen) setCatMenuOpen(false);
    hideAllCallouts();
  };

  const activePOILabel = (c: CategoryKey) => {
    switch (c) {
      case "search":
        return t("navigation.search.filter.everything");
      case "cc":
        return t("navigation.search.filter.cc");
      case "clinics":
        return t("navigation.search.filter.clinics");
      case "parks":
        return t("navigation.search.filter.parks");
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={["left", "right"]}>
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={setLang as (c: LangCode) => void}
        bgColor="#C6DBE6"
        includeTopInset={true}
        barHeight={44}
        topPadding={2}
        title={t("navigation.title")}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/LogIn");
        }}
      />

      {/* Search bar */}
      {!navigating && (
        <View style={s.searchWrap} pointerEvents="box-none">
          <View style={s.searchRow} pointerEvents="auto">
            {/* Category dropdown */}
            <View style={s.catWrap}>
              <Pressable
                onPress={() => setCatMenuOpen((v) => !v)}
                style={({ pressed }) => [s.catBtn, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
              >
                <AppText variant="button" weight="800">
                  {activePOILabel(category)}
                </AppText>
                <Ionicons
                  name={catMenuOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="#6B7280"
                  style={{ marginLeft: 6 }}
                />
              </Pressable>

              {catMenuOpen && (
                <View style={s.catMenu}>
                  {(["search", "cc", "clinics", "parks"] as CategoryKey[]).map((key) => (
                    <Pressable
                      key={key}
                      onPress={() => {
                        setCategory(key);
                        setCatMenuOpen(false);
                        closeSheetsForMapInteraction();
                      }}
                      style={s.catMenuItem}
                    >
                      <AppText
                        variant="label"
                        weight={category === key ? "900" : "700"}
                        color={category === key ? "#111827" : "#4B5563"}
                      >
                        {activePOILabel(key)}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Text input */}
            <TextInput
              style={s.input}
              placeholder={t("navigation.search.placeholder")}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => searchDestination()}
              returnKeyType="search"
            />

            {/* Right icon: search or clear */}
            {query.trim().length === 0 ? (
              <TouchableOpacity style={s.iconBtn} onPress={() => searchDestination()}>
                <Ionicons name="search" size={18} color="#111827" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.iconBtn} onPress={() => setQuery("")}>
                <Ionicons name="close-circle" size={20} color="#111827" />
              </TouchableOpacity>
            )}
          </View>

          {suggestions.length > 0 && (
            <FlatList
              data={suggestions}
              keyExtractor={(item) => item.place_id}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.suggestionItem} onPress={() => handleSuggestionPress(item)}>
                  <AppText>{item.description}</AppText>
                </TouchableOpacity>
              )}
              style={s.suggestionsContainer}
            />
          )}

          {/* Travel mode */}
          <View style={[s.modeRow, { marginTop: 8 }]} pointerEvents="auto">
            {(["driving", "walking", "bicycling", "transit"] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[s.modeBtn, mode === m && s.modeBtnActive]}
                onPress={() => {
                  closeSheetsForMapInteraction();
                  setMode(m);
                }}
              >
                <AppText variant="button" weight="800" color={mode === m ? "#FFF" : "#333"}>
                  {t(`navigation.search.modes.${m}`)}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Map */}
      <MapView
        provider={providerProp}
        ref={mapRef}
        style={s.map}
        showsUserLocation={permissionGranted}
        showsMyLocationButton={false}
        initialRegion={{
          latitude: location?.latitude ?? 1.3521,
          longitude: location?.longitude ?? 103.8198,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        onPress={closeSheetsForMapInteraction}
        onRegionChangeStart={closeSheetsForMapInteraction}
      >
        {destination && category === "search" && (
          <Marker coordinate={destination} title={t("navigation.search.destination")} pinColor="#007AFF" />
        )}

        {activePOIs.map((p) => (
          <Marker
            key={p.id}
            coordinate={p.coords}
            title={p.name}
            pinColor={activeColor}
            ref={(r) => {
              markerRefs.current[p.id] = r as MapMarker | null;
            }}
          >
            <Callout tooltip={false} onPress={() => openPoiOptions(p)}>
              <View style={s.calloutCard}>
                <AppText variant="label" weight="800" numberOfLines={2}>
                  {p.name}
                </AppText>
              </View>
            </Callout>
          </Marker>
        ))}

        {routeCoords.length > 0 && <Polyline coordinates={routeCoords} strokeWidth={5} strokeColor="#007AFF" />}
      </MapView>

      {/* NAV OVERLAY (step-by-step) */}
      {navigating && (
        <View style={s.navOverlay}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <AppText variant="label" weight="900">
              {eta ? t("navigation.search.eta", { duration: eta.duration, distance: eta.distance }) : t("navigation.search.loading")}
            </AppText>

            <TouchableOpacity onPress={() => setShowAllSteps((v) => !v)} style={{ padding: 6 }}>
              <AppText variant="button" weight="800" color="#007AFF">
                {showAllSteps ? t("common.hide") : t("common.show")}
              </AppText>
            </TouchableOpacity>
          </View>

          {/* CURRENT STEP CARD */}
          {steps[currentStepIndex] && (
            <View style={s.currentStepCard}>
              <AppText variant="label" color="#007AFF" weight="900" style={{ marginBottom: 4 }}>
                {fmtMeters(stepDistanceM)} · {t("navigation.search.nextStepShort")}
              </AppText>
              <AppText variant="body" weight="900">
                {stripHtml(steps[currentStepIndex].html)}
              </AppText>
              {steps[currentStepIndex + 1] && (
                <AppText variant="caption" color="#6B7280" style={{ marginTop: 6 }}>
                  {t("navigation.search.then")} {stripHtml(steps[currentStepIndex + 1].html)}
                </AppText>
              )}

              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  style={[s.pillBtn, { backgroundColor: "#F3F4F6" }]}
                  onPress={() => Speech.speak(stripHtml(steps[currentStepIndex].html))}
                >
                  <Ionicons name="volume-high" size={16} color="#111827" />
                  <AppText variant="button" weight="800" style={{ marginLeft: 6 }}>
                    {t("navigation.search.repeat")}
                  </AppText>
                </TouchableOpacity>

                {currentStepIndex < steps.length - 1 && (
                  <TouchableOpacity
                    style={[s.pillBtn, { backgroundColor: "#E5F2FF" }]}
                    onPress={() => {
                      const nextIdx = Math.min(currentStepIndex + 1, steps.length - 1);
                      setCurrentStepIndex(nextIdx);
                      const nxt = steps[nextIdx];
                      Speech.speak(stripHtml(nxt.html));
                    }}
                  >
                    <Ionicons name="play-skip-forward" size={16} color="#007AFF" />
                    <AppText variant="button" weight="800" color="#007AFF" style={{ marginLeft: 6 }}>
                      {t("navigation.search.skip")}
                    </AppText>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[s.pillBtn, { backgroundColor: "#FFEBEB" }]}
                  onPress={() => {
                    Speech.stop();
                    Speech.speak(t("navigation.search.stopped"));
                    clearNavigation({ restoreCategory: true });
                  }}
                >
                  <Ionicons name="stop" size={16} color="#FF3B30" />
                  <AppText variant="button" weight="800" color="#FF3B30" style={{ marginLeft: 6 }}>
                    {t("navigation.search.stopNav")}
                  </AppText>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* FULL LIST (toggle) */}
          {showAllSteps && (
            <FlatList
              data={steps}
              keyExtractor={(it) => it.id}
              style={s.stepList}
              renderItem={({ item, index }) => (
                <AppText
                  variant="body"
                  weight={index === currentStepIndex ? "900" : "700"}
                  style={index === currentStepIndex ? s.stepActive : undefined}
                >
                  • {stripHtml(item.html)} ({item.dist})
                </AppText>
              )}
            />
          )}
        </View>
      )}

      {/* Start bar */}
      {destination && !navigating && (
        <View style={s.bottomBar}>
          <AppText variant="label" weight="800" style={{ marginBottom: 8 }}>
            {t("navigation.search.destinationSet")}
          </AppText>
          <TouchableOpacity style={s.startBtn} onPress={startNavigation}>
            <AppText variant="button" weight="800" color="#FFF">
              {t("navigation.search.startNav")}
            </AppText>
          </TouchableOpacity>
        </View>
      )}

      {/* Recenter */}
      {location && (
        <TouchableOpacity
          style={s.recenterBtn}
          onPress={() => {
            closeSheetsForMapInteraction();
            try {
              mapRef.current?.animateToRegion(
                {
                  latitude: location.latitude,
                  longitude: location.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                },
                500
              );
            } catch {}
          }}
        >
          <Ionicons name="locate" size={18} color="#007AFF" />
        </TouchableOpacity>
      )}

      {!permissionGranted && (
        <View style={s.overlay}>
          <AppText variant="label">{t("navigation.search.requesting")}</AppText>
        </View>
      )}

      {/* Options Sheet */}
      {showPoiOptions && selectedPOI && (
        <View style={s.optionsSheet}>
          <View style={{ alignItems: "center" }}>
            <View style={s.grabber} />
          </View>
          <View style={s.optionsHeader}>
            <AppText variant="label" weight="900">
              {selectedPOI.name}
            </AppText>
            <TouchableOpacity onPress={() => setShowPoiOptions(false)} style={{ padding: 6 }}>
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            <TouchableOpacity
              style={[s.optBtn, { backgroundColor: "#007AFF" }]}
              onPress={() => {
                setDestinationOnly(selectedPOI.coords);
                setShowPoiOptions(false);
              }}
            >
              <AppText variant="button" weight="800" color="#FFF">
                {t("navigation.actions.setDestination")}
              </AppText>
            </TouchableOpacity>

            {category === "cc" && (
              <TouchableOpacity
                style={[s.optBtn, { backgroundColor: "#111827" }]}
                onPress={() => {
                  setShowPoiOptions(false);
                  fetchCcActivities(selectedPOI);
                }}
              >
                <AppText variant="button" weight="800" color="#FFF">
                  {t("navigation.actions.viewActivities")}
                </AppText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Activities Sheet */}
      {sheetOpen && (
        <View style={s.activitiesSheet}>
          <View style={{ alignItems: "center" }}>
            <View style={s.grabber} />
          </View>

          <View style={s.optionsHeader}>
            <AppText variant="label" weight="900">
              {sheetCcName} — {t("community.title")}
            </AppText>
            <TouchableOpacity onPress={() => setSheetOpen(false)} style={{ padding: 6 }}>
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 6 }}>
            {sheetLoading ? (
              <AppText variant="label" color="#6B7280">
                {t("navigation.search.loading")}
              </AppText>
            ) : sheetEvents.length === 0 ? (
              <AppText variant="label" color="#6B7280">
                {t("community.noEvents")}
              </AppText>
            ) : (
              <FlatList
                data={sheetEvents}
                keyExtractor={(it) => it.id}
                style={{ maxHeight: 280 }}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                renderItem={({ item }) => {
                  const dateStr = item.start_date || "";
                  const timeStr = item.start_time ? item.start_time.slice(0, 5) : "";
                  return (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: "#E5E7EB",
                        borderRadius: 12,
                        padding: 10,
                        backgroundColor: "#FFF",
                      }}
                    >
                      <AppText variant="label" weight="900" numberOfLines={2}>
                        {item.title || t("navigation.reminders.untitled")}
                      </AppText>

                      <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                        {!!dateStr && (
                          <View style={s.pill}>
                            <AppText variant="caption" weight="800">
                              {dateStr}
                            </AppText>
                          </View>
                        )}
                        {!!timeStr && (
                          <View style={s.pill}>
                            <AppText variant="caption" weight="800">
                              {timeStr}
                            </AppText>
                          </View>
                        )}
                        {!!item.fee && (
                          <View style={[s.pill, { backgroundColor: "#EEF2FF" }]}>
                            <AppText variant="caption" weight="900" color="#1D4ED8">
                              {item.fee}
                            </AppText>
                          </View>
                        )}
                      </View>

                      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                        <TouchableOpacity
                          style={{
                            backgroundColor: "#111827",
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                          }}
                          onPress={() => {
                            setSheetOpen(false);
                            router.push({
                              pathname: "/tabs/Community",
                              params: { openEventId: item.id },
                            });
                          }}
                        >
                          <AppText variant="button" weight="800" color="#FFF">
                            {t("navigation.actions.viewDetails")}
                          </AppText>
                        </TouchableOpacity>

                        {/* Set reminder 1h before */}
                        <TouchableOpacity
                          style={{
                            backgroundColor: "#007AFF",
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                          }}
                          onPress={() => scheduleReminder(item)}
                        >
                          <AppText variant="button" weight="800" color="#FFF">
                            {t("navigation.actions.setReminder")}
                          </AppText>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const TOP_OFFSET = Platform.OS === "ios" ? 112 : 88;

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFF" },

  searchWrap: {
    position: "absolute",
    top: TOP_OFFSET,
    left: 12,
    right: 12,
    zIndex: 5,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },
  catWrap: { position: "relative" },
  catBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  catMenu: {
    position: "absolute",
    top: 44,
    left: 0,
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 6,
    minWidth: 170,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    zIndex: 20,
  },
  catMenuItem: { paddingVertical: 10, paddingHorizontal: 12 },

  suggestionsContainer: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginTop: 8,
    maxHeight: 200,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },

  input: { flex: 1, paddingVertical: 8, paddingHorizontal: 8 },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  modeRow: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 6,
    justifyContent: "space-around",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    marginTop: 8,
  },
  modeBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  modeBtnActive: { backgroundColor: "#007AFF" },

  map: { flex: 1 },

  bottomBar: {
    position: "absolute",
    bottom: 20,
    left: 12,
    right: 12,
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 12,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  startBtn: { backgroundColor: "#007AFF", borderRadius: 10, paddingVertical: 12, alignItems: "center" },

  navOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(255,255,255,0.96)",
    padding: 14,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  currentStepCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  pillBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },

  stepList: { maxHeight: 160, marginTop: 8, marginBottom: 4 },
  stepActive: { fontWeight: "900", color: "#007AFF" },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
  },

  recenterBtn: {
    position: "absolute",
    left: 12,
    top: TOP_OFFSET + 104,
    backgroundColor: "#FFF",
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    zIndex: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },

  calloutCard: {
    minWidth: 180,
    maxWidth: 280,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: 10,
    flexDirection: "column",
    alignItems: "flex-start",
  },

  optionsSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  activitiesSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    padding: 12,
    maxHeight: 360,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  grabber: { width: 36, height: 4, borderRadius: 999, backgroundColor: "#E5E7EB", marginBottom: 8 },
  optionsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  optBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },

  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#F3F4F6" },
});
