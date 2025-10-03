import polyline from "@mapbox/polyline";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/AuthProvider";
import TopBar, { type LangCode } from "../../src/components/TopBar";

const GOOGLE_WEB_API_KEY = "AIzaSyDaNhQ7Ah-mlf2j4qHZTjXgtzrP-uBokGs";

type LatLng = { latitude: number; longitude: number };

export default function NavigationScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { i18n } = useTranslation();
  const setLang = async (code: string) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  const [location, setLocation] = useState<LatLng | null>(null);
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [steps, setSteps] = useState<{ id: string; html: string; dist: string; endLoc: { lat: number; lng: number } }[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [eta, setEta] = useState<{ duration: string; distance: string } | null>(null);
  const [mode, setMode] = useState<"driving" | "walking" | "bicycling" | "transit">("driving");
  const [navigating, setNavigating] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);

  const mapRef = useRef<MapView | null>(null);

  const isExpoGo = Constants.appOwnership === "expo";
  const providerProp = isExpoGo ? undefined : PROVIDER_GOOGLE; 

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

  const searchDestination = async () => {
    if (!query.trim()) return Alert.alert("Enter a destination");
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_WEB_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.results?.length) return Alert.alert("Not found", "Try a more specific place name.");
      const loc = data.results[0].geometry.location;
      const dest = { latitude: loc.lat, longitude: loc.lng };
      setDestination(dest);

      if (location && mapRef.current) {
        mapRef.current.fitToCoordinates([location, dest], {
          edgePadding: { top: 80, right: 40, bottom: 200, left: 40 },
          animated: true,
        });
      }
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
          endLoc: s.end_location, // { lat, lng }
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

  const startNavigation = () => {
    if (!location || !destination) return Alert.alert("Pick a destination first");
    setNavigating(true);
    setCurrentStepIndex(0);
    fetchDirections(location, destination, /*speak*/ true);
    Speech.speak("Navigation started.");
  };

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      {/* Top Bar */}
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={setLang as (c: LangCode) => void}
        title="Navigation"
        showHeart={false}
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
              onSubmitEditing={searchDestination}
              returnKeyType="search"
            />
            <TouchableOpacity style={s.searchBtn} onPress={searchDestination}>
              <Text style={s.searchBtnText}>Search</Text>
            </TouchableOpacity>
          </View>

          <View style={s.modeRow}>
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
        provider="google"
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
        {destination && <Marker coordinate={destination} title="Destination" />}
        {routeCoords.length > 0 && (
          <Polyline coordinates={routeCoords} strokeWidth={5} strokeColor="#007AFF" />
        )}
      </MapView>

      {/* Start/Stop */}
      {destination && !navigating && (
        <View style={s.bottomBar}>
          <TouchableOpacity style={s.startBtn} onPress={startNavigation}>
            <Text style={s.startText}>Start Navigation</Text>
          </TouchableOpacity>
        </View>
      )}

      {navigating && eta && (
        <View style={s.instructions}>
          <Text style={s.eta}>ETA: {eta.duration} ({eta.distance})</Text>
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

  // Search + mode
  searchWrap: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 + 8 : 56, // under TopBar
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

  // Map
  map: { flex: 1 },

  // Bottom bar
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

  // Instructions
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

  // Overlay while waiting for permission
  overlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
  },
});
