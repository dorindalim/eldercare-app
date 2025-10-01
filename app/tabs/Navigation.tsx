import polyline from "@mapbox/polyline";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

export default function NavigationScreen() {
  const [location, setLocation] = useState(null);
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [steps, setSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [eta, setEta] = useState(null);
  const [mode, setMode] = useState("driving");
  const [navigating, setNavigating] = useState(false);

  const mapRef = useRef(null);
  const apiKey = "AIzaSyDaNhQ7Ah-mlf2j4qHZTjXgtzrP-uBokGs"; // Enable Directions + Geocoding

  // Watch location
  useEffect(() => {
    let subscription = null;
    if (navigating) {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          subscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              timeInterval: 5000,
              distanceInterval: 10,
            },
            (pos) => {
              setLocation(pos.coords);
              if (destination) fetchDirections(pos.coords, destination, false);
              checkStepProgress(pos.coords);
            }
          );
        }
      })();
    }
    return () => subscription && subscription.remove();
  }, [navigating]);

  const searchDestination = async () => {
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      query
    )}&key=${apiKey}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    if (!geoData.results.length) return;

    const destLoc = geoData.results[0].geometry.location;
    setDestination({ latitude: destLoc.lat, longitude: destLoc.lng });

    if (location && mapRef.current) {
      mapRef.current.fitToCoordinates(
        [
          { latitude: location.latitude, longitude: location.longitude },
          { latitude: destLoc.lat, longitude: destLoc.lng },
        ],
        {
          edgePadding: { top: 80, right: 40, bottom: 200, left: 40 },
          animated: true,
        }
      );
    }
  };

  const fetchDirections = async (origin, dest, speak = true) => {
    if (!origin || !dest) return;

    const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${dest.latitude},${dest.longitude}&mode=${mode}&key=${apiKey}`;
    const dirRes = await fetch(directionsUrl);
    const dirData = await dirRes.json();

    if (dirData.routes.length) {
      const route = dirData.routes[0];
      const points = polyline.decode(route.overview_polyline.points);
      const coords = points.map(([lat, lng]) => ({
        latitude: lat,
        longitude: lng,
      }));
      setRouteCoords(coords);

      const leg = route.legs[0];
      setEta({ duration: leg.duration.text, distance: leg.distance.text });
      setSteps(
        leg.steps.map((s, idx) => ({
          id: idx.toString(),
          html: s.html_instructions,
          dist: s.distance.text,
          endLoc: s.end_location,
        }))
      );

      if (speak) {
        Speech.speak(
          `Route ready. ETA ${leg.duration.text}, distance ${leg.distance.text}`
        );
      }
    }
  };

  // Check if user has reached next step
  const checkStepProgress = (coords) => {
    if (!steps.length) return;
    const step = steps[currentStepIndex];
    const dist = getDistance(coords, step.endLoc);
    if (dist < 30 && currentStepIndex < steps.length - 1) {
      const nextStep = steps[currentStepIndex + 1];
      setCurrentStepIndex(currentStepIndex + 1);
      Speech.speak(stripHtml(nextStep.html));
    }
  };

  // Simple distance (Haversine formula)
  const getDistance = (pos, endLoc) => {
    const R = 6371e3;
    const φ1 = (pos.latitude * Math.PI) / 180;
    const φ2 = (endLoc.lat * Math.PI) / 180;
    const Δφ = ((endLoc.lat - pos.latitude) * Math.PI) / 180;
    const Δλ = ((endLoc.lng - pos.longitude) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const stripHtml = (html) => html.replace(/<[^>]+>/g, "");

  return (
    <SafeAreaView style={s.safe}>
      {/* Search bar */}
      {!navigating && (
        <View style={s.searchBox}>
          <TextInput
            style={s.input}
            placeholder="Enter destination"
            value={query}
            onChangeText={setQuery}
          />
          <Button title="Search" onPress={searchDestination} />
        </View>
      )}

      {/* Mode selector */}
      {!navigating && (
        <View style={s.modeRow}>
          {["driving", "walking", "bicycling", "transit"].map((m) => (
            <TouchableOpacity
              key={m}
              style={[s.modeBtn, mode === m && s.modeBtnActive]}
              onPress={() => setMode(m)}
            >
              <Text style={mode === m ? s.modeTextActive : s.modeText}>
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Map */}
      <MapView
        provider="google"
        ref={mapRef}
        style={s.map}
        showsUserLocation={true}
        initialRegion={{
          latitude: location?.latitude || 1.283,
          longitude: location?.longitude || 103.86,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {destination && <Marker coordinate={destination} title="Destination" />}
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeWidth={5}
            strokeColor="blue"
          />
        )}
      </MapView>

      {/* Navigation controls */}
      {destination && !navigating && (
        <View style={s.bottomBar}>
          <Button
            title="Start Navigation"
            onPress={() => {
              setNavigating(true);
              fetchDirections(location, destination);
              setCurrentStepIndex(0);
            }}
          />
        </View>
      )}

      {/* Active navigation info */}
      {navigating && eta && (
        <View style={s.instructions}>
          <Text style={s.eta}>
            ETA: {eta.duration} ({eta.distance})
          </Text>
          <Text style={s.nextStep}>
            Next:{" "}
            {steps[currentStepIndex]
              ? stripHtml(steps[currentStepIndex].html)
              : "Arrived"}
          </Text>
          <FlatList
            data={steps}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <Text
                style={[
                  s.step,
                  index === currentStepIndex && { fontWeight: "bold" },
                ]}
              >
                • {stripHtml(item.html)} ({item.dist})
              </Text>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  map: { flex: 1 },
  searchBox: {
    position: "absolute",
    top: 40,
    left: 10,
    right: 10,
    backgroundColor: "white",
    borderRadius: 8,
    flexDirection: "row",
    padding: 6,
    zIndex: 10,
  },
  input: { flex: 1, marginRight: 8 },
  modeRow: {
    position: "absolute",
    top: 90,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "white",
    borderRadius: 8,
    padding: 6,
    zIndex: 10,
  },
  modeBtn: { padding: 6, borderRadius: 6 },
  modeBtnActive: { backgroundColor: "#007AFF" },
  modeText: { color: "#333" },
  modeTextActive: { color: "#fff", fontWeight: "600" },
  bottomBar: {
    position: "absolute",
    bottom: 20,
    left: 10,
    right: 10,
    backgroundColor: "white",
    borderRadius: 8,
    padding: 10,
  },
  instructions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: 250,
    backgroundColor: "rgba(255,255,255,0.95)",
    padding: 10,
  },
  eta: { fontWeight: "700", marginBottom: 6, fontSize: 16 },
  nextStep: { fontSize: 15, marginBottom: 6, color: "#007AFF" },
  step: { fontSize: 14, marginVertical: 2 },
});
