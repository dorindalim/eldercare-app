import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

export default function NavigationScreen() {
  // State variables
  const [location, setLocation] = useState(null);
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [steps, setSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [eta, setEta] = useState(null);
  const [mode, setMode] = useState("driving");
  const [navigating, setNavigating] = useState(false);
  const [error, setError] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const mapRef = useRef(null);

  // Request location permissions
  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    try {
      console.log('Requesting location permission...');
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('Location permission status:', status);
      
      if (status === 'granted') {
        setPermissionGranted(true);
        const position = await Location.getCurrentPositionAsync({});
        setLocation(position.coords);
        console.log('Got initial location:', position.coords);
      } else {
        setError('Location permission denied. Please enable location services.');
      }
    } catch (err) {
      console.error('Permission error:', err);
      setError(`Location error: ${err.message}`);
    }
  };

  // Mock search function
  const searchDestination = async () => {
    if (!query.trim()) {
      Alert.alert('Error', 'Please enter a destination');
      return;
    }

    // Mock destination coordinates (Singapore)
    const mockDestination = {
      latitude: 1.3521, 
      longitude: 103.8198,
    };
    
    setDestination(mockDestination);
    
    // Mock route data
    setEta({ duration: "15 mins", distance: "5 km" });
    setSteps([{
      id: "1",
      html: "Head <b>north</b> on Main Street",
      dist: "200 m",
      endLoc: mockDestination
    }]);

    // Zoom map to show both locations
    if (location && mapRef.current) {
      mapRef.current.fitToCoordinates(
        [
          { latitude: location.latitude, longitude: location.longitude },
          mockDestination,
        ],
        {
          edgePadding: { top: 80, right: 40, bottom: 200, left: 40 },
          animated: true,
        }
      );
    }
  };

  // Mock directions function
  const fetchDirections = async (origin, dest, speak = true) => {
    if (!origin || !dest) return;

    // Create a simple straight-line route for demo
    const mockCoords = [
      { latitude: origin.latitude, longitude: origin.longitude },
      { latitude: dest.latitude, longitude: dest.longitude },
    ];
    
    setRouteCoords(mockCoords);
    setEta({ duration: "15 mins", distance: "5 km" });
    setSteps([
      {
        id: "1",
        html: "Head toward your destination",
        dist: "5 km",
        endLoc: dest
      }
    ]);

    if (speak) {
      Speech.speak("Route ready. ETA 15 minutes, distance 5 kilometers");
    }
  };

  // Handle navigation start
  const startNavigation = () => {
    if (!destination) {
      Alert.alert('Error', 'Please set a destination first');
      return;
    }

    setNavigating(true);
    fetchDirections(location, destination);
    setCurrentStepIndex(0);
    
    Speech.speak(`Navigation started. Heading to destination. ETA 15 minutes.`);
  };

  // Simple HTML strip function
  const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, "");
  };

  // Error display
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Location Error</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={requestLocationPermission}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Main UI
  return (
    <SafeAreaView style={styles.safe}>
      {/* Search Section */}
      {!navigating && (
        <View style={styles.searchSection}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.input}
              placeholder="Enter destination (e.g., City Hall)"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={searchDestination}
            />
            <TouchableOpacity style={styles.searchButton} onPress={searchDestination}>
              <Text style={styles.searchButtonText}>Search</Text>
            </TouchableOpacity>
          </View>

          {/* Travel Mode Selector */}
          <View style={styles.modeRow}>
            {["driving", "walking", "transit"].map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                onPress={() => setMode(m)}
              >
                <Text style={mode === m ? styles.modeTextActive : styles.modeText}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        showsUserLocation={true}
        showsMyLocationButton={true}
        initialRegion={{
          latitude: location?.latitude || 1.3521,
          longitude: location?.longitude || 103.8198,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {destination && (
          <Marker 
            coordinate={destination} 
            title="Destination"
            pinColor="red"
          />
        )}
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeWidth={4}
            strokeColor="#007AFF"
          />
        )}
      </MapView>

      {/* Navigation Controls */}
      {destination && !navigating && (
        <View style={styles.controlBar}>
          <TouchableOpacity style={styles.navButton} onPress={startNavigation}>
            <Text style={styles.navButtonText}>Start Navigation</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Navigation Instructions */}
      {navigating && (
        <View style={styles.instructions}>
          <Text style={styles.eta}>
            🎯 ETA: {eta?.duration} ({eta?.distance})
          </Text>
          <Text style={styles.nextStep}>
            Next: {steps[currentStepIndex] ? stripHtml(steps[currentStepIndex].html) : "Arrived!"}
          </Text>
          
          <FlatList
            data={steps}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <Text style={[
                styles.step,
                index === currentStepIndex && styles.currentStep
              ]}>
                • {stripHtml(item.html)} ({item.dist})
              </Text>
            )}
            style={styles.stepsList}
          />
          
          <TouchableOpacity style={styles.stopButton} onPress={() => setNavigating(false)}>
            <Text style={styles.stopButtonText}>Stop Navigation</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Loading State */}
      {!permissionGranted && !error && (
        <View style={styles.loadingOverlay}>
          <Text>Requesting location access...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// Styles
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  errorContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 20 
  },
  errorTitle: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    marginBottom: 10 
  },
  errorText: { 
    textAlign: 'center', 
    marginBottom: 20 
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  searchSection: {
    position: "absolute",
    top: Platform.OS === 'ios' ? 40 : 20,
    left: 10,
    right: 10,
    zIndex: 10,
  },
  searchBox: {
    backgroundColor: "white",
    borderRadius: 8,
    flexDirection: "row",
    padding: 8,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  input: { 
    flex: 1, 
    marginRight: 8,
    padding: 8,
  },
  searchButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  modeRow: {
    backgroundColor: "white",
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modeBtn: { 
    padding: 8, 
    borderRadius: 6 
  },
  modeBtnActive: { 
    backgroundColor: "#007AFF" 
  },
  modeText: { 
    color: "#333" 
  },
  modeTextActive: { 
    color: "#fff", 
    fontWeight: "600" 
  },
  map: { 
    flex: 1 
  },
  controlBar: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  navButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  navButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  instructions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(255,255,255,0.95)",
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: 300,
  },
  eta: { 
    fontWeight: "700", 
    marginBottom: 8, 
    fontSize: 16 
  },
  nextStep: { 
    fontSize: 15, 
    marginBottom: 12, 
    color: "#007AFF",
    fontWeight: "600"
  },
  stepsList: {
    maxHeight: 150,
    marginBottom: 12,
  },
  step: { 
    fontSize: 14, 
    marginVertical: 4 
  },
  currentStep: { 
    fontWeight: "bold", 
    color: "#007AFF" 
  },
  stopButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  stopButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.8)",
  },
});