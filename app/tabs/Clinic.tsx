
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import CHASClinics from "../../assets/data/CHASClinics.json";
import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import { supabase } from "../../src/lib/supabase";
import FilterSheet, {
  type FilterSection,
} from "../../src/components/FilterSheet";
import Pagination from "../../src/components/Pagination";
import SearchBar from "../../src/components/SearchBar";
import SummaryChip from "../../src/components/SummaryChip";
import TopBar, { type LangCode } from "../../src/components/TopBar";

const datasetId = "d_9d0bbe366aee923a6e202f80bb356bb9";
const url = `https://data.gov.sg/api/action/datastore_search?resource_id=${datasetId}`;

const distanceMeters = (a, b) => {
  if (!a || !b) return 0;
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

const kmStr = (m) => (m == null ? "" : `${(m / 1000).toFixed(1)} km`);

const normalizeName = (name) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\(/g, " ")
    .replace(/\)/g, " ")
    .replace(/&/g, "and")
    .replace(/\//g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export default function ClinicScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { logout } = useAuth();
  const [allClinics, setAllClinics] = useState([]);
  const [filteredClinics, setFilteredClinics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const flatListRef = useRef<FlatList>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [tempFilters, setTempFilters] = useState({ regions: [] as string[] });
  const [selectedFilterItems, setSelectedFilterItems] = useState<string[]>([]);

  const setLang = (code) => {
    i18n.changeLanguage(code);
    AsyncStorage.setItem("lang", code).catch(() => {});
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        let location = null;
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const pos = await Location.getCurrentPositionAsync({});
            location = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };
            setUserLocation(location);
          }
        } catch (e) {
          console.warn("Could not get user location:", e);
        }

        // Fetch mock wait times from Supabase
        const { data: mockData } = await supabase
          .from('clinic_wait_times')
          .select('clinic_name, wait_time_minutes');

        const mockWaitTimesMap = new Map();
        if (mockData) {
          mockData.forEach(record => {
            mockWaitTimesMap.set(record.clinic_name, record.wait_time_minutes);
          });
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch waiting time data");
        const data = await response.json();
        const waitingTimeRecords = data.result?.records || [];

        const liveWaitingTimesMap = new Map();
        waitingTimeRecords.forEach((record) => {
          const normalizedName = normalizeName(record.hospital);
          liveWaitingTimesMap.set(normalizedName, record.minutes);
        });

        const METERS_PER_MINUTE_ASSUMED_SPEED = 250; // 15 km/h

        const allClinics = CHASClinics.features.map((feature) => {
          const description = feature.properties.Description;
          const nameMatch = description.match(
            /<th>HCI_NAME<\/th> <td>(.*?)<\/td>/
          );
          const phoneMatch = description.match(
            /<th>HCI_TEL<\/th> <td>(.*?)<\/td>/
          );
          const name = nameMatch ? nameMatch[1] : "Unknown Clinic";
          const phone = phoneMatch ? phoneMatch[1] : null;
          const normalizedName = normalizeName(name);
          const coords = feature.geometry.coordinates;
          const lat = coords[1];
          const lon = coords[0];

          const distance = location
            ? distanceMeters(location, { latitude: lat, longitude: lon })
            : null;

          // Priority: 1. Live API, 2. Supabase Mock, 3. Null
          let waitingTime = liveWaitingTimesMap.get(normalizedName) || mockWaitTimesMap.get(normalizedName) || null;

          const travelTime = distance != null ? distance / METERS_PER_MINUTE_ASSUMED_SPEED : null;
          const totalTime = waitingTime != null && travelTime != null ? waitingTime + travelTime : null;

          return {
            name,
            phone,
            lat,
            lon,
            distance,
            minutes: waitingTime,
            totalTime,
          };
        });

        if (location) {
          // Sort by total time, with fallbacks
          allClinics.sort((a, b) => {
            if (a.totalTime != null && b.totalTime != null) {
              return a.totalTime - b.totalTime;
            }
            if (a.totalTime != null) return -1;
            if (b.totalTime != null) return 1;
            if (a.distance != null && b.distance != null) {
              return a.distance - b.distance;
            }
            return 0;
          });
        }

        setAllClinics(allClinics);
        setFilteredClinics(allClinics);
      } catch (err) {
        console.error("Error processing clinic data:", err);
        setError("Failed to load clinic data. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setFilteredClinics(allClinics);
      return;
    }
    const lowercasedQuery = query.toLowerCase();
    const filtered = allClinics.filter((clinic) =>
      clinic.name.toLowerCase().includes(lowercasedQuery)
    );
    setFilteredClinics(filtered);
  };

  const handleGetDirections = (clinic) => {
    router.push({
      pathname: "/tabs/Navigation",
      params: {
        presetQuery: clinic.name,
        autoStart: "1",
        presetLat: clinic.lat ? String(clinic.lat) : undefined,
        presetLng: clinic.lon ? String(clinic.lon) : undefined,
      },
    });
  };

  const handleCallClinic = (phone) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    flatListRef.current?.scrollToOffset({ animated: true, offset: 0 });
  };

  const getFilterSections = (): FilterSection[] => {
    return [
      {
        id: "regions",
        type: "chips-multi",
        title: "Region",
        options: [
          { key: "Central", label: "Central" },
          { key: "North", label: "North" },
          { key: "South", label: "South" },
          { key: "East", label: "East" },
          { key: "West", label: "West" },
        ],
        selected: tempFilters.regions,
        onToggle: (key) => {
          setTempFilters((prev) => ({
            ...prev,
            regions: prev.regions.includes(key)
              ? prev.regions.filter((i) => i !== key)
              : [...prev.regions, key],
          }));
        },
      },
    ];
  };

  const renderClinicItem = ({ item }) => (
    <View style={s.clinicItem}>
      <View style={s.titleContainer}>
        <AppText variant="title" weight="700" style={s.clinicName}>
          {item.name}
        </AppText>
        {userLocation && item.distance != null && (
          <AppText variant="caption" weight="600" style={s.distanceText}>
            ({kmStr(item.distance)} away)
          </AppText>
        )}
      </View>

      <AppText
        variant="body"
        weight="400"
        style={item.minutes ? s.waitingTime : s.waitingTimeUnavailable}
      >
        {item.minutes
          ? `Waiting time: ${item.minutes} minutes`
          : "Waiting time: Unavailable"}
      </AppText>

      {item.totalTime != null && (
        <AppText variant="body" weight="600" style={s.totalTime}>
          Est. Time (Travel + Wait): {Math.round(item.totalTime)} mins
        </AppText>
      )}

      {item.phone && (
        <AppText variant="body" weight="400" style={s.contactText}>
          Contact: {item.phone}
        </AppText>
      )}

      <View style={s.buttonContainer}>
        <TouchableOpacity
          style={s.directionButton}
          onPress={() => handleGetDirections(item)}
        >
          <AppText variant="button" weight="700" style={s.directionButtonText}>
            Get Directions
          </AppText>
        </TouchableOpacity>
        {item.phone && (
          <TouchableOpacity
            style={s.callButton}
            onPress={() => handleCallClinic(item.phone)}
          >
            <AppText variant="button" weight="700" style={s.callButtonText}>
              Call to Enquire
            </AppText>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const clinicsPerPage = 10;
  const totalPages = Math.ceil(filteredClinics.length / clinicsPerPage);
  const currentClinics = filteredClinics.slice(
    (currentPage - 1) * clinicsPerPage,
    currentPage * clinicsPerPage
  );

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <TopBar
          language={i18n.language as LangCode}
          setLanguage={setLang as (c: LangCode) => void}
          bgColor="#FFFAF6"
          includeTopInset={true}
          barHeight={44}
          topPadding={2}
          title={t("home.clinics")}
          onLogout={async () => {
            await logout();
            router.replace("/Authentication/LogIn");
          }}
        />
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <AppText variant="body" weight="400" style={s.loadingText}>
            Loading clinic data...
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={s.safe}>
        <TopBar
          language={i18n.language as LangCode}
          setLanguage={setLang as (c: LangCode) => void}
          bgColor="#FAE6D4"
          includeTopInset={true}
          barHeight={44}
          topPadding={2}
          title={t("home.clinics")}
          onLogout={async () => {
            await logout();
            router.replace("/Authentication/LogIn");
          }}
        />
        <View style={s.errorContainer}>
          <AppText variant="body" weight="600" style={s.errorText}>
            {error}
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["left", "right"]}>
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={setLang as (c: LangCode) => void}
        bgColor="#FAE6D4"
        includeTopInset={true}
        barHeight={44}
        topPadding={2}
        title={t("home.clinics")}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/LogIn");
        }}
      />

      <View style={s.searchBarContainer}>
        <SearchBar
          value={searchQuery}
          placeholder={t("clinics.searchPlaceholder")}
          onChangeText={handleSearch}
          onSubmit={() => handleSearch(searchQuery)}
          onPressFilter={() => setShowFilterPanel(true)}
        />
        {selectedFilterItems.length > 0 && (
          <SummaryChip items={selectedFilterItems} style={{ marginTop: 8 }} />
        )}
      </View>

      <FilterSheet
        visible={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        sections={getFilterSections()}
        onReset={() => setTempFilters({ regions: [] })}
        onApply={() => {
          setSelectedFilterItems(tempFilters.regions);
          setShowFilterPanel(false);
        }}
      />

      <FlatList
        ref={flatListRef}
        data={currentClinics}
        renderItem={renderClinicItem}
        keyExtractor={(item, index) => `${item.name}-${index}`}
        contentContainerStyle={s.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <AppText style={s.emptyText}>No clinics match your search.</AppText>
          </View>
        }
        ListFooterComponent={
          filteredClinics.length > 0 ? (
            <Pagination
              page={currentPage}
              total={totalPages}
              onChange={handlePageChange}
            />
          ) : null
        }
        ListFooterComponentStyle={{ padding: 16 }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  searchBarContainer: {
    padding: 16,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
  },
  listContainer: {
    padding: 16,
  },
  clinicItem: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  titleContainer: {
    marginBottom: 8,
  },
  clinicName: {
    marginBottom: 4,
  },
  distanceText: {
    color: "#6C757D",
    fontSize: 14,
  },
  totalTime: {
    color: "#007AFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  waitingTime: {
    color: "#28A745",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  waitingTimeUnavailable: {
    color: "#6C757D",
    fontSize: 16,
    fontWeight: "400",
    marginBottom: 4,
  },
  contactText: {
    color: "#6C757D",
    fontSize: 14,
    fontWeight: "400",
    marginBottom: 8,
  },
  reviewsText: {
    color: "#6C757D",
    fontSize: 16,
    fontWeight: "400",
    marginBottom: 8,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 10,
  },
  directionButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  directionButtonText: {
    color: "#FFF",
  },
  callButton: {
    backgroundColor: "#E7F3FF",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  callButtonText: {
    color: "#007AFF",
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#6C757D",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    textAlign: "center",
    marginBottom: 16,
    color: "#DC3545",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 50,
  },
  emptyText: {
    fontSize: 16,
    color: "#6C757D",
    textAlign: "center",
  },
});
