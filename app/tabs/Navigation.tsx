import { Ionicons } from '@expo/vector-icons';
import polyline from "@mapbox/polyline";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, {
  Callout,
  Marker,
  Polyline,
  PROVIDER_GOOGLE
} from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/AuthProvider";
import TopBar, { type LangCode } from "../../src/components/TopBar";

import CLINIC_GEOJSON from "../../assets/data/CHASClinics.json";
import CC_GEOJSON from "../../assets/data/CommunityClubs.json";
import PARK_GEOJSON from "../../assets/data/Parks.json";

const GOOGLE_WEB_API_KEY = "AIzaSyDaNhQ7Ah-mlf2j4qHZTjXgtzrP-uBokGs";

type LatLng = { latitude: number; longitude: number };

type POI = {
  id: string;
  name: string;
  coords: LatLng;
};

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
  const [eta, setEta] = useState<{ duration: string; distance: string } | null>(null);
  const [mode, setMode] = useState<"driving" | "walking" | "bicycling" | "transit">("driving");
  const [navigating, setNavigating] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);

  const [category, setCategory] = useState<"search" | "cc" | "clinics" | "parks">("search");
  const [ccPOIs, setCcPOIs] = useState<POI[]>([]);
  const [clinicPOIs, setClinicPOIs] = useState<POI[]>([]);
  const [parkPOIs, setParkPOIs] = useState<POI[]>([]);

  const mapRef = useRef<MapView | null>(null);

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
        Alert.alert("Location permission needed", "Please enable location services to navigate.");
      }
    })();
  }, []);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    if (navigating) {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          sub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
            (pos) => {
              const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
              setLocation(coords);
              if (destination) fetchDirections(coords, destination, /*speak*/ false);
              checkStepProgress(coords);
            }
          );
        }
      })();
    }
    return () => sub && sub.remove();
  }, [navigating, destination, mode]);

  useEffect(() => {
    if (presetQuery && !autoRanRef.current) {
      autoRanRef.current = true;
      setQuery(presetQuery);
      searchDestination(presetQuery);
    }
  }, [presetQuery]);

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
        if (kind === "clinic") {
          name =
            extractFromDescription(desc, "HCI_NAME") ||
            props.HCI_NAME ||
            props.hci_name;
        } else if (kind === "cc") {
          name =
            extractFromDescription(desc, "NAME") ||
            props.CC_NAME ||
            props.cc_name;
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
          } as POI;
        }

        if (geom.type === "MultiPoint" && Array.isArray(geom.coordinates)) {
          return geom.coordinates.map(([lng, lat]: number[], j: number) => ({
            id: f.id?.toString?.() ?? `${kind}-${idx}-${j}`,
            name,
            coords: { latitude: lat, longitude: lng },
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
    } catch (e) {
      console.warn("Parse CC geojson failed:", e);
    }
    try {
      setClinicPOIs(parseGeoJSONPoints(CLINIC_GEOJSON, "Clinic", "clinic"));
    } catch (e) {
      console.warn("Parse Clinics geojson failed:", e);
    }
    try {
      setParkPOIs(parseGeoJSONPoints(PARK_GEOJSON, "Park", "park"));
    } catch (e) {
      console.warn("Parse Parks geojson failed:", e);
    }
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
      latitudeDelta: Math.max(0.01, (maxLat - minLat) + pad),
      longitudeDelta: Math.max(0.01, (maxLng - minLng) + pad),
    };

    mapRef.current.animateToRegion(region, 500);
  }, [category, activePOIs]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!location) return;
    if (navigating) return;
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
    } catch (e) {
      // ignore
    }
  }, [location, navigating]);

  const searchDestination = async (override?: string) => {
    const q = (override ?? query).trim();
    if (!q) return Alert.alert("Enter a destination");
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        q
      )}&key=${GOOGLE_WEB_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.results?.length) return Alert.alert("Not found", "Try a more specific place name.");
      const loc = data.results[0].geometry.location;
      const dest = { latitude: loc.lat, longitude: loc.lng };
      setDestinationOnly(dest);
    } catch (e) {
      Alert.alert("Search error", String(e));
    }
  };

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
      setSteps(
        leg.steps.map((s: any, idx: number) => ({
          id: String(idx),
          html: s.html_instructions,
          dist: s.distance.text,
          endLoc: s.end_location,
        }))
      );

      if (speak && mapRef.current) {
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 80, right: 40, bottom: 220, left: 40 },
          animated: true,
        });
        Speech.speak(`Route ready. ETA ${leg.duration.text}, distance ${leg.distance.text}`);
      }
    } catch (e) {
      Alert.alert("Directions error", String(e));
    }
  };

  const checkStepProgress = (pos: LatLng) => {
    if (!steps.length) return;
    const step = steps[currentStepIndex];
    const dist = distanceMeters(pos, { latitude: step.endLoc.lat, longitude: step.endLoc.lng });
    if (dist < 30 && currentStepIndex < steps.length - 1) {
      const next = steps[currentStepIndex + 1];
      setCurrentStepIndex((i) => i + 1);
      Speech.speak(stripHtml(next.html));
    }
  };

  const distanceMeters = (a: LatLng, b: LatLng) => {
    const R = 6371e3;
    const φ1 = (a.latitude * Math.PI) / 180;
    const φ2 = (b.latitude * Math.PI) / 180;
    const Δφ = ((b.latitude - a.latitude) * Math.PI) / 180;
    const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;
    const x =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };

  const stripHtml = (html: string) => html?.replace(/<[^>]+>/g, "") || "";

  const setDestinationOnly = (dest: LatLng) => {
    setDestination(dest);
    setCurrentStepIndex(0);

    setRouteCoords([]);
    setSteps([]);
    setEta(null);

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

    setCategory("search");
  };

  const startNavigation = () => {
    if (!location || !destination) return Alert.alert("Pick a destination first");
    setNavigating(true);
    setCurrentStepIndex(0);
    fetchDirections(location, destination, /*speak*/ true);
    Speech.speak("Navigation started.");
  };

  return (
    <SafeAreaView style={s.safe} edges={["left", "right"]}>
      {/* Top Bar */}
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

      {/* Search + mode (hidden while navigating) */}
      {!navigating && (
        <View style={s.searchWrap}>
          <View style={s.searchRow}>
            <TextInput
              style={s.input}
              placeholder="Enter destination"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => searchDestination()}
              returnKeyType="search"
            />
            <TouchableOpacity style={s.searchBtn} onPress={() => searchDestination()}>
              <Text style={s.searchBtnText}>Search</Text>
            </TouchableOpacity>
          </View>

          <View style={s.modeRow}>
            {([
              ["search", "Search"],
              ["cc", "CC"],
              ["clinics", "Clinics"],
              ["parks", "Parks"],
            ] as const).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[s.modeBtn, category === key && s.modeBtnActive]}
                onPress={() => setCategory(key)}
              >
                <Text style={category === key ? s.modeTextActive : s.modeText}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[s.modeRow, { marginTop: 8 }]}>
            {(["driving", "walking", "bicycling", "transit"] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[s.modeBtn, mode === m && s.modeBtnActive]}
                onPress={() => setMode(m)}
              >
                <Text style={mode === m ? s.modeTextActive : s.modeText}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </Text>
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
        showsMyLocationButton={true}
        initialRegion={{
          latitude: location?.latitude ?? 1.3521,
          longitude: location?.longitude ?? 103.8198,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* Destination marker (from search or tap) */}
        {destination && category === "search" && (
          <Marker coordinate={destination} title="Destination" pinColor="#007AFF" />
        )}

        {/* Category markers */}
        {activePOIs.map((p) => (
          <Marker
            key={p.id}
            coordinate={p.coords}
            title={p.name}
            pinColor={activeColor}
            onCalloutPress={() => setDestinationOnly(p.coords)} 
          >
            <Callout tooltip={false}>
                <View style={s.calloutCard}>
                  <Text
                    style={s.calloutTitle}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {p.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setDestinationOnly(p.coords)}
                    style={s.calloutBtn}
                  >
                    <Text style={s.calloutBtnText}>Set Destination</Text>
                  </TouchableOpacity>
                </View>
              </Callout>
          </Marker>
        ))}

        {/* Route polyline */}
        {routeCoords.length > 0 && (
          <Polyline coordinates={routeCoords} strokeWidth={5} strokeColor="#007AFF" />
        )}
      </MapView>

      {/* Start/Stop bottom bar */}
      {destination && !navigating && (
        <View style={s.bottomBar}>
          <Text style={{ marginBottom: 8, fontWeight: "700" }}>Destination set</Text>
          <TouchableOpacity style={s.startBtn} onPress={startNavigation}>
            <Text style={s.startText}>Start Navigation</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Recenter floating button */}
      {location && (
        <TouchableOpacity
          style={s.recenterBtn}
          onPress={() => {
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
            } catch (e) {}
          }}
        >
          <Ionicons name="locate" size={22} color="#007AFF" />
        </TouchableOpacity>
      )}

      {navigating && eta && (
        <View style={s.instructions}>
          <Text style={s.eta}>
            ETA: {eta.duration} ({eta.distance})
          </Text>
          <Text style={s.nextStep}>
            Next: {steps[currentStepIndex] ? stripHtml(steps[currentStepIndex].html) : "Arrived"}
          </Text>
          <FlatList
            data={steps}
            keyExtractor={(it) => it.id}
            renderItem={({ item, index }) => (
              <Text style={[s.step, index === currentStepIndex && s.stepActive]}>
                • {stripHtml(item.html)} ({item.dist})
              </Text>
            )}
            style={s.stepList}
          />
          <TouchableOpacity
            style={s.stopBtn}
            onPress={() => {
              setNavigating(false);
              setRouteCoords([]);
              setSteps([]);
              setEta(null);
              Speech.speak("Navigation stopped.");
            }}
          >
            <Text style={s.stopText}>Stop Navigation</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Hint while waiting for permission */}
      {!permissionGranted && (
        <View style={s.overlay}>
          <Text>Requesting location access…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFF" },

  searchWrap: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 + 8 : 56,
    left: 12,
    right: 12,
    zIndex: 10,
  },
  searchRow: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 8,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    marginBottom: 8,
  },
  input: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, marginRight: 8 },
  searchBtn: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: "center",
  },
  searchBtnText: { color: "#FFF", fontWeight: "700" },

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
  },
  modeBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  modeBtnActive: { backgroundColor: "#007AFF" },
  modeText: { color: "#333" },
  modeTextActive: { color: "#FFF", fontWeight: "700" },

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
  startText: { color: "#FFF", fontSize: 16, fontWeight: "700" },

  instructions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(255,255,255,0.96)",
    padding: 14,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: 280,
  },
  eta: { fontWeight: "800", marginBottom: 6, fontSize: 16 },
  nextStep: { fontSize: 15, marginBottom: 8, color: "#007AFF", fontWeight: "700" },
  stepList: { maxHeight: 150, marginBottom: 10 },
  step: { fontSize: 14, marginVertical: 3 },
  stepActive: { fontWeight: "800", color: "#007AFF" },
  stopBtn: { backgroundColor: "#FF3B30", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  stopText: { color: "#FFF", fontSize: 16, fontWeight: "700" },

  overlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
  },

  recenterBtn: {
    position: 'absolute',
    right: 16,
    bottom: 34,
    backgroundColor: '#FFF',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    zIndex: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  recenterText: { fontSize: 20, color: '#007AFF', fontWeight: '800' },

  // inner icon styles removed; using Ionicons locate icon instead

  calloutCard: {
    minWidth: 200,
    maxWidth: 300,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 10,
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  calloutTitle: {
    fontWeight: "800",
    fontSize: 15,
    lineHeight: 20,
    color: "#111",
    marginBottom: 10,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  calloutSubtitle: {
    color: "#555",
    fontSize: 13,
    marginTop: -4,
    marginBottom: 10,
  },
  calloutBtn: {
    backgroundColor: "#007AFF",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 6,
    alignSelf: "flex-start",
    alignItems: "center",
  },
  calloutBtnText: {
    color: "#FFF",
    fontWeight: "700",
  },
});
