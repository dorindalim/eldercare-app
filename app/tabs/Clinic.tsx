
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import CHASClinics from "../../assets/data/CHASClinics.json";
import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import FilterSheet, {
  type FilterSection,
} from "../../src/components/FilterSheet";
import Pagination from "../../src/components/Pagination";
import SearchBar from "../../src/components/SearchBar";
import SummaryChip from "../../src/components/SummaryChip";
import TopBar, { type LangCode } from "../../src/components/TopBar";
import { supabase } from "../../src/lib/supabase";

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

const getRegionFromPostalCode = (postalCode) => {
  if (!postalCode) return null;
  const firstTwoDigits = parseInt(postalCode.substring(0, 2), 10);
  if (firstTwoDigits >= 1 && firstTwoDigits <= 16) return "Central";
  if (firstTwoDigits >= 17 && firstTwoDigits <= 30) return "Central";
  if (firstTwoDigits >= 31 && firstTwoDigits <= 41) return "East";
  if (firstTwoDigits >= 42 && firstTwoDigits <= 45) return "East";
  if (firstTwoDigits >= 46 && firstTwoDigits <= 52) return "East";
  if (firstTwoDigits >= 53 && firstTwoDigits <= 57) return "North-East";
  if (firstTwoDigits >= 58 && firstTwoDigits <= 60) return "West";
  if (firstTwoDigits >= 61 && firstTwoDigits <= 64) return "West";
  if (firstTwoDigits >= 65 && firstTwoDigits <= 68) return "West";
  if (firstTwoDigits >= 69 && firstTwoDigits <= 71) return "North";
  if (firstTwoDigits >= 72 && firstTwoDigits <= 73) return "North";
  if (firstTwoDigits >= 75 && firstTwoDigits <= 76) return "North";
  if (firstTwoDigits >= 77 && firstTwoDigits <= 80) return "North-East";
  if (firstTwoDigits >= 81 && firstTwoDigits <= 81) return "East";
  if (firstTwoDigits >= 82 && firstTwoDigits <= 82) return "North-East";
  return null;
};

export default function ClinicScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { logout } = useAuth();
  const [allClinics, setAllClinics] = useState([]);
  const [filteredClinics, setFilteredClinics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
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

  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({ animated: true, offset: 0 });
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    scrollToTop();
  };

  const fetchClinics = async () => {
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

      const { data: mockData, error: mockError } = await supabase
        .from('clinic_wait_times')
        .select('clinic_name, wait_time_minutes');

      if (mockError) throw mockError;

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

      const METERS_PER_MINUTE_ASSUMED_SPEED = 250;

      const clinics = CHASClinics.features.map((feature) => {
        const description = feature.properties.Description;
        const nameMatch = description.match(/<th>HCI_NAME<\/th> <td>(.*?)<\/td>/);
        const phoneMatch = description.match(/<th>HCI_TEL<\/th> <td>(.*?)<\/td>/);
        const postalCodeMatch = description.match(/<th>POSTAL_CD<\/th> <td>(.*?)<\/td>/);

        const name = nameMatch ? nameMatch[1] : "Unknown Clinic";
        const phone = phoneMatch ? phoneMatch[1] : null;
        const postalCode = postalCodeMatch ? postalCodeMatch[1] : null;
        const region = getRegionFromPostalCode(postalCode);
        const normalizedName = normalizeName(name);
        const coords = feature.geometry.coordinates;
        const lat = coords[1];
        const lon = coords[0];

        const distance = location ? distanceMeters(location, { latitude: lat, longitude: lon }) : null;
        let waitingTime = liveWaitingTimesMap.get(normalizedName) || mockWaitTimesMap.get(normalizedName) || null;
        const travelTime = distance != null ? distance / METERS_PER_MINUTE_ASSUMED_SPEED : null;
        const totalTime = waitingTime != null && travelTime != null ? waitingTime + travelTime : null;

        return { name, phone, lat, lon, distance, minutes: waitingTime, totalTime, region };
      });

      if (location) {
        clinics.sort((a, b) => {
          if (a.totalTime != null && b.totalTime != null) return a.totalTime - b.totalTime;
          if (a.totalTime != null) return -1;
          if (b.totalTime != null) return 1;
          if (a.distance != null && b.distance != null) return a.distance - b.distance;
          return 0;
        });
      }

      setAllClinics(clinics);
      setFilteredClinics(clinics);
    } catch (err) {
      console.error("Error processing clinic data:", err);
      setError("Failed to load clinic data. Please try again later.");
      Alert.alert("Error", "Failed to load clinic data. Please try again later.");
    } finally {
      setInitialLoading(false);
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applyFilters = () => {
    let filtered = allClinics;

    if (searchQuery.trim()) {
      const lowercasedQuery = searchQuery.toLowerCase();
      filtered = filtered.filter((clinic) =>
        clinic.name.toLowerCase().includes(lowercasedQuery)
      );
    }

    if (tempFilters.regions.length > 0) {
      filtered = filtered.filter((clinic) =>
        tempFilters.regions.includes(clinic.region)
      );
    }

    setFilteredClinics(filtered);
    setCurrentPage(1);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    applyFilters();
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

  const onRefresh = () => {
    setRefreshing(true);
    setLoading(true);
    fetchClinics();
  };

  useEffect(() => {
    const load = async () => {
      setInitialLoading(true);
      await fetchClinics();
    };
    load();
  }, []);

  const getFilterSections = (): FilterSection[] => {
    return [
      {
        id: "regions",
        type: "chips-multi",
        title: t("walking.filters.categories.region"),
        options: [
          { key: "Central", label: t("walking.filters.regions.central") },
          { key: "North", label: t("walking.filters.regions.north") },
          { key: "North-East", label: "North-East" },
          { key: "East", label: t("walking.filters.regions.east") },
          { key: "West", label: t("walking.filters.regions.west") },
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
            ({kmStr(item.distance)} {t('walking.location.away', { distance: '' })})
          </AppText>
        )}
      </View>

      <AppText
        variant="body"
        weight="400"
        style={item.minutes ? s.waitingTime : s.waitingTimeUnavailable}
      >
        {item.minutes
          ? `${t('clinics.waitingTime')}: ${item.minutes} ${t('clinics.minutes')}`
          : `${t('clinics.waitingTime')}: ${t('clinics.unavailable')}`}
      </AppText>

      {item.totalTime != null && (
        <AppText variant="body" weight="600" style={s.totalTime}>
          {t('clinics.totalEstTime')}: {Math.round(item.totalTime)} {t('clinics.mins')}
        </AppText>
      )}

      {item.phone && (
        <AppText variant="body" weight="400" style={s.contactText}>
          {t('clinics.contact')}: {item.phone}
        </AppText>
      )}

      <View style={s.buttonContainer}>
        <TouchableOpacity
          style={s.directionButton}
          onPress={() => handleGetDirections(item)}
        >
          <AppText variant="button" weight="700" style={s.directionButtonText}>
            {t('walking.parks.getDirections')}
          </AppText>
        </TouchableOpacity>
        {item.phone && (
          <TouchableOpacity
            style={s.callButton}
            onPress={() => handleCallClinic(item.phone)}
          >
            <AppText variant="button" weight="700" style={s.callButtonText}>
              {t('clinics.callToEnquire')}
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
          <TouchableOpacity style={s.retryButton} onPress={fetchClinics}>
            <AppText variant="button" weight="700" style={s.retryButtonText}>
              Try Again
            </AppText>
          </TouchableOpacity>
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
          onChangeText={setSearchQuery}
          onSubmit={() => handleSearch(searchQuery)}
          onPressFilter={() => setShowFilterPanel(true)}
        />
        {selectedFilterItems.length > 0 && (
          <View style={s.summaryChipContainer}>
            <View style={s.summaryChipHeader}>
              <AppText variant="caption" weight="600" style={s.summaryChipTitle}>
                {t("walking.summary.activeFilters")}
              </AppText>
              <TouchableOpacity onPress={() => {
                setTempFilters({ regions: [] });
                setSelectedFilterItems([]);
                applyFilters();
              }} style={s.clearAllButton}>
                <AppText variant="caption" weight="600" style={s.clearAllText}>
                  {t("walking.summary.clearAll")}
                </AppText>
              </TouchableOpacity>
            </View>
            <SummaryChip items={selectedFilterItems} style={{ marginTop: 8 }} />
          </View>
        )}
      </View>

      <FilterSheet
        visible={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        sections={getFilterSections()}
        onReset={() => setTempFilters({ regions: [] })}
        onApply={() => {
          setSelectedFilterItems(tempFilters.regions);
          applyFilters();
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
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            colors={["#007AFF"]} 
            tintColor="#007AFF" 
          />
        }
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            {initialLoading || loading ? (
              <>
                <ActivityIndicator size="small" color="#007AFF" />
                <AppText variant="body" weight="400" style={s.emptyText}>
                  Loading clinic data...
                </AppText>
              </>
            ) : (
              <>
                <AppText variant="body" weight="400" style={s.emptyText}>
                  No clinics match your search.
                </AppText>
                <TouchableOpacity style={s.retryButton} onPress={fetchClinics}>
                  <AppText variant="button" weight="700" style={s.retryButtonText}>
                    Try Again
                  </AppText>
                </TouchableOpacity>
              </>
            )}
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
    flexGrow: 1,
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
  buttonContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: 'flex-start',
  },
  directionButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    minWidth: 150,
    alignItems: 'center',
  },
  directionButtonText: {
    color: "#FFF",
    textAlign: 'center',
  },
  callButton: {
    backgroundColor: "#E7F3FF",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    minWidth: 150,
    alignItems: 'center',
  },
  callButtonText: {
    color: "#007AFF",
    fontWeight: "600",
    textAlign: 'center',
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
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    textAlign: "center",
    marginBottom: 16,
    color: "#6C757D",
  },
  retryButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#FFF",
  },
  summaryChipContainer: {
    backgroundColor: "#FFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
  },
  summaryChipHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  summaryChipTitle: { color: "#6B7280", fontSize: 14 },
  clearAllButton: { paddingHorizontal: 8, paddingVertical: 4 },
  clearAllText: { color: "#EF4444", fontSize: 14 },
  summaryChipsRow: { flexDirection: "row" },
});