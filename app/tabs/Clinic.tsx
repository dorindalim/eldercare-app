import AsyncStorage from "@react-native-async-storage/async-storage";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { t } from "i18next";
import { useCallback } from "react";
import CHASClinics from "../../assets/data/CHASClinics.json";
import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import FilterSheet, {
  type FilterSection,
} from "../../src/components/FilterSheet";
import ItemDetailsModal from '../../src/components/ItemDetailsModal';
import ListItem from "../../src/components/ListItems";
import Pagination from "../../src/components/Pagination";
import SearchBar from "../../src/components/SearchBar";
import SummaryChip from "../../src/components/SummaryChip";
import TopBar, { type LangCode } from "../../src/components/TopBar";
import { supabase } from "../../src/lib/supabase";

const datasetId = "d_9d0bbe366aee923a6e202f80bb356bb9";
const url = `https://data.gov.sg/api/action/datastore_search?resource_id=${datasetId}`;

const REGION_BG: Record<string, string> = {
  "Central":   "#E5E1D8",
  "North":     "#8E8E8E",
  "North-East": "#F7A8AF",
  "East":      "#FEA775",
  "West":      "#93E6AA",
};

const REGION_KEY = {
  "Central": "central",
  "North": "north",
  "North-East": "northEast",
  "East": "east",
  "West": "west",
} as const;

const regionLabel = (key: keyof typeof REGION_KEY, tFn: typeof t) =>
  tFn(`walking.filters.regions.${REGION_KEY[key]}`);

const REGION_FALLBACKS = ["#E5E1D8", "#8E8E8E", "#F7A8AF", "#FEA775", "#93E6AA"];
const colorForRegion = (region?: string | null) => {
  if (region && REGION_BG[region]) return REGION_BG[region];
  if (!region) return REGION_FALLBACKS[0];
  const h = Array.from(region).reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381);
  return REGION_FALLBACKS[h % REGION_FALLBACKS.length];
};

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

const chasLogo = require('../../assets/photos/icons/chas-logo.png'); 

export default function ClinicScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { logout } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const bottomPad = Math.max(0, tabBarHeight + insets.bottom - 100);
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState(null);

  const isFocused = useIsFocused();
  useFocusEffect(
    useCallback(() => {
      return () => setDetailsOpen(false);
    }, [])
  );

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

  const applyFilters = (filters) => {
    let filtered = allClinics;

    if (searchQuery.trim()) {
      const lowercasedQuery = searchQuery.toLowerCase();
      filtered = filtered.filter((clinic) =>
        clinic.name.toLowerCase().includes(lowercasedQuery)
      );
    }

    if (filters.regions.length > 0) {
      filtered = filtered.filter((clinic) =>
        filters.regions.includes(clinic.region)
      );
    }

    setFilteredClinics(filtered);
    setCurrentPage(1);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    applyFilters(tempFilters);
  };

  const clearAllFilters = () => {
    const newFilters = { regions: [] };
    setTempFilters(newFilters);
    setSelectedFilterItems([]);
    applyFilters(newFilters);
  };

  const handleGetDirections = (clinic) => {
    setDetailsOpen(false);
    setSelectedClinic(null);

    setTimeout(() => {
      router.push({
        pathname: "/tabs/Navigation",
        params: {
          presetQuery: clinic.name,
          presetLat: clinic.lat ? String(clinic.lat) : undefined,
          presetLng: clinic.lon ? String(clinic.lon) : undefined,
        },
      });
    }, 200); 
  };

  const handleCallClinic = (phone) => {
    setDetailsOpen(false);
    setSelectedClinic(null);
    if (phone) Linking.openURL(`tel:${phone}`);
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
          { key: "Central",    label: t("walking.filters.regions.central"),   color: colorForRegion("Central") },
          { key: "North",      label: t("walking.filters.regions.north"),     color: colorForRegion("North") },
          { key: "North-East", label: t("walking.filters.regions.northEast"), color: colorForRegion("North-East") },
          { key: "East",       label: t("walking.filters.regions.east"),      color: colorForRegion("East") },
          { key: "West",       label: t("walking.filters.regions.west"),      color: colorForRegion("West") },
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

  const RenderClinicItem = ({ item }: { item: any }) => {
    const subtitle = item.distance != null ? `${kmStr(item.distance)}` : '';
    
    const details = [
      item.minutes != null ? `${t('clinics.waitingTime')}: ${item.minutes}${t('clinics.minutes')}` : null
    ].filter(Boolean).join('\n'); 

    const metadata = item.totalTime != null ? 
    `${t('clinics.totalEstTime')}: ${Math.round(item.totalTime)}${t('clinics.mins')}` : '';

    const regionColor = colorForRegion(item.region);

    return (
      <ListItem
        title={item.name}
        image={chasLogo}
        placeholderIcon="local-hospital" 
        subtitle={subtitle}
        details={details}
        metadata={metadata} 
        showArrow={true}
        onPress={() => {
          setSelectedClinic(item);
          setDetailsOpen(true);
        }}
        subtitleIcon="location-on"
        detailsIcon="access-time" 
        metadataIcon="timer"
        imageResizeMode="contain"
        buttonBgColor={regionColor}
        buttonBgColorActive={regionColor}
        buttonBorderColor="#000"         
        buttonBorderColorActive="#000"
      />
    );
  };

  const clinicsPerPage = 10;
  const totalPages = Math.ceil(filteredClinics.length / clinicsPerPage);
  const currentClinics = filteredClinics.slice(
    (currentPage - 1) * clinicsPerPage,
    currentPage * clinicsPerPage
  );

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
          router.replace("/Authentication/Welcome");
        }}
      />
        <SearchBar
          value={searchQuery}
          placeholder={t("clinics.searchPlaceholder")}
          onChangeText={setSearchQuery}
          onSubmit={() => handleSearch(searchQuery)}
          onPressFilter={() => setShowFilterPanel(true)}
          style={{ margin: 12}}
        />
        {selectedFilterItems.length > 0 && (
          <View style={s.summaryChipContainer}>
            <View style={s.summaryChipHeader}>
              <AppText variant="caption" weight="600" style={s.summaryChipTitle}>
                {t("walking.summary.activeFilters")}
              </AppText>
              <TouchableOpacity onPress={clearAllFilters} style={s.clearAllButton}>
                <AppText variant="caption" weight="600" style={s.clearAllText}>
                  {t("walking.summary.clearAll")}
                </AppText>
              </TouchableOpacity>
            </View>
            <SummaryChip
              items={selectedFilterItems.map((k) => regionLabel(k as keyof typeof REGION_KEY, t))}
              style={{ marginTop: 8 }}
            />
          </View>
        )}
      <FilterSheet
        visible={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        sections={getFilterSections()}
        onReset={() => setTempFilters({ regions: [] })}
        onApply={() => {
          setSelectedFilterItems(tempFilters.regions);
          applyFilters(tempFilters);
          setShowFilterPanel(false);
        }}
        title={t("walking.filter.title")}
        labels={{ reset: t("walking.filter.reset"), apply: t("walking.filter.apply") }}
      />

      <FlatList
        ref={flatListRef}
        data={currentClinics}
        renderItem={RenderClinicItem}
        keyExtractor={(item, index) => `${item.name}-${index}`}
        contentContainerStyle={[
          s.listContainer,
          { paddingBottom: filteredClinics.length > 0 ? 0 : bottomPad },
        ]}
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
            <View
              style={{
                paddingHorizontal: 16,   
                paddingBottom: bottomPad, 
                alignItems: "center",
                marginTop: 8,            
              }}
            >
              <Pagination
                page={currentPage}
                total={totalPages}
                onChange={handlePageChange}
              />
            </View>
          ) : null
        }
      />

      {isFocused && (
        <ItemDetailsModal
          clinic={selectedClinic}
          visible={detailsOpen}
          onClose={() => {
            setDetailsOpen(false);
            setSelectedClinic(null);
          }}
          userLocation={userLocation}
          onGetDirections={handleGetDirections}
          onCallClinic={handleCallClinic}
          distanceMeters={distanceMeters}
          kmStr={kmStr}
          chasLogo={chasLogo}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FFFAF0",
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
    backgroundColor: "#FFFAF0",
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