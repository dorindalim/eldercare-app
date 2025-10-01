import polyline from "@mapbox/polyline"; // install with: npm install @mapbox/polyline
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  SafeAreaView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

export default function NavigationScreen() {
  const [location, setLocation] = useState(null);
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const mapRef = useRef(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      let current = await Location.getCurrentPositionAsync({});
      setLocation(current.coords);
    })();
  }, []);

  const searchAndNavigate = async () => {
    const apiKey = "AIzaSyDaNhQ7Ah-mlf2j4qHZTjXgtzrP-uBokGs"; // Directions + Geocoding enabled

    // Step 1: Get destination lat/lng from Geocoding API
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      query
    )}&key=${apiKey}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    if (geoData.results.length === 0) return;

    const destLoc = geoData.results[0].geometry.location;
    setDestination({ latitude: destLoc.lat, longitude: destLoc.lng });

    // Step 2: Fetch route from Directions API
    const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${location.latitude},${location.longitude}&destination=${destLoc.lat},${destLoc.lng}&key=${apiKey}`;
    const dirRes = await fetch(directionsUrl);
    const dirData = await dirRes.json();

    if (dirData.routes.length) {
      const points = polyline.decode(
        dirData.routes[0].overview_polyline.points
      );
      const coords = points.map(([lat, lng]) => ({
        latitude: lat,
        longitude: lng,
      }));
      setRouteCoords(coords);

      // Fit map to route
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={s.searchBox}>
        <TextInput
          style={s.input}
          placeholder="Enter destination"
          value={query}
          onChangeText={setQuery}
        />
        <Button title="Go" onPress={searchAndNavigate} />
      </View>

      <MapView
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
        {/* Destination marker */}
        {destination && <Marker coordinate={destination} title="Destination" />}

        {/* Route polyline */}
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeWidth={5}
            strokeColor="blue"
          />
        )}
      </MapView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
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
  input: {
    flex: 1,
    marginRight: 8,
  },
});
