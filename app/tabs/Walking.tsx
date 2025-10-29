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
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import FilterSheet, { type FilterSection } from "../../src/components/FilterSheet";
import ItemDetailsModal from "../../src/components/ItemDetailsModal";
import ListItem from "../../src/components/ListItems";
import Pagination from "../../src/components/Pagination";
import SearchBar from "../../src/components/SearchBar";
import SummaryChip from "../../src/components/SummaryChip";
import TopBar, { type LangCode } from "../../src/components/TopBar";
import { listItemConfig } from "../../src/config/listItemConfig";
import { supabase } from "../../src/lib/supabase";

type Activity = {
  title: string;
  description: string;
  etiquette_link: string;
  category: string;
};

type Amenity = {
  title: string;
  description: string;
  image: string;
};

type ParkLocation = {
  title: string;
  url: string;
  image: string;
  region: string;
  hours: string;
  activities: Activity[];
  amenities: Amenity[];
  latitude: number | null;
  longitude: number | null;
  scraped_at: string;
  description?: string | null;
};

type LatLng = { latitude: number; longitude: number };

const distanceMeters = (a: LatLng, b: LatLng) => {
  const R = 6371e3;
  const φ1 = (a.latitude * Math.PI) / 180;
  const φ2 = (b.latitude * Math.PI) / 180;
  const Δφ = ((b.latitude - a.latitude) * Math.PI) / 180;
  const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const kmStr = (m?: number | null) =>
  m == null ? "" : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;

const REGION_BG: Record<string, string> = {
  "Central": "#E5E1D8",
  "North": "#8E8E8E",
  "North-East": "#F7A8AF",
  "Offshore islands": "#8ECFD5",
  "East": "#FEA775",
  "West": "#93E6AA",
  "South": "#FED787",
};

const FALLBACKS = ["#E5E1D8", "#8E8E8E", "#FFD3CD", "#C7E7EA", "#FFD38A", "#C9F3D5", "#FFD3CD"];
const colorForRegion = (region?: string) => {
  if (!region) return FALLBACKS[0];
  const key = region.trim();
  if (REGION_BG[key]) return REGION_BG[key];
  const h = Array.from(key).reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381);
  return FALLBACKS[h % FALLBACKS.length];
};

export default function WalkingScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { t, i18n } = useTranslation();

  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const bottomPad = Math.max(0, tabBarHeight + insets.bottom - 100);

  const [currentPage, setCurrentPage] = useState(1);
  const flatListRef = useRef<FlatList>(null);

  const [parks, setParks] = useState<ParkLocation[]>([]);
  const [filteredParks, setFilteredParks] = useState<ParkLocation[]>([]);
  const [selectedPark, setSelectedPark] = useState<ParkLocation | null>(null);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [showParkDetails, setShowParkDetails] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [tempFilters, setTempFilters] = useState({
    activities: [] as string[],
    amenities: [] as string[],
    regions: [] as string[],
  });
  const [selectedFilterItems, setSelectedFilterItems] = useState<string[]>([]);

  const parksPerPage = 8;
  const totalPages = Math.ceil(filteredParks.length / parksPerPage);
  const currentParks = filteredParks.slice(
    (currentPage - 1) * parksPerPage,
    currentPage * parksPerPage
  );

  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({ animated: true, offset: 0 });
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    scrollToTop();
  };

  const setLang = async (code: string) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  const getUserLocation = async (): Promise<LatLng | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return null;
      const pos = await Location.getCurrentPositionAsync({});
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      return null;
    }
  };

  const updateSelectedFilterItems = () => {
    const items: string[] = [];
    Object.values(tempFilters).forEach((category) => items.push(...category));
    setSelectedFilterItems(items);
  };

  const applyFilters = (parkList: ParkLocation[], filters: typeof tempFilters) => {
    const hasActiveFilters = Object.values(filters).some((category) => category.length > 0);
    if (!hasActiveFilters) {
      setFilteredParks(parkList);
      return;
    }

    const scoredParks = parkList.map((park) => {
      let score = 0;

      for (const selected of filters.activities) {
        if (Array.isArray(park.activities)) {
          for (const a of park.activities) if (a?.title === selected) score += 1;
        }
      }

      for (const selected of filters.amenities) {
        if (Array.isArray(park.amenities)) {
          for (const am of park.amenities) if (am?.title === selected) score += 1;
        }
      }

      for (const selected of filters.regions) {
        if (park.region === selected) score += 1;
      }

      return { park, score };
    });

    const sorted = scoredParks
      .filter((x) => x.score > 0)
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : parkList.indexOf(a.park) - parkList.indexOf(b.park)))
      .map((x) => x.park);

    setFilteredParks(sorted);
  };

  const handleOpenFilters = () => setShowFilterPanel(true);

  const handleApplyFilters = () => {
    applyFilters(
      searchQuery
        ? parks.filter((park) => {
            const term = searchQuery.toLowerCase();
            const titleMatch = park.title?.toLowerCase().includes(term) || false;
            const activityMatch =
              Array.isArray(park.activities) &&
              park.activities.some((a) => a?.title?.toLowerCase().includes(term));
            const amenityMatch =
              Array.isArray(park.amenities) &&
              park.amenities.some((am) => am?.title?.toLowerCase().includes(term));
            const regionMatch = park.region?.toLowerCase().includes(term) || false;
            return titleMatch || activityMatch || amenityMatch || regionMatch;
          })
        : parks,
      tempFilters
    );
    setShowFilterPanel(false);
    updateSelectedFilterItems();
    setCurrentPage(1);
    scrollToTop();
  };

  const handleResetFilters = () => {
    setTempFilters({ activities: [], amenities: [], regions: [] });
  };

  const clearAllFilters = () => {
    handleResetFilters();
    setSelectedFilterItems([]);
    setFilteredParks(
      searchQuery
        ? parks.filter((park) => {
            const term = searchQuery.toLowerCase();
            const titleMatch = park.title?.toLowerCase().includes(term) || false;
            const activityMatch =
              Array.isArray(park.activities) &&
              park.activities.some((a) => a?.title?.toLowerCase().includes(term));
            const amenityMatch =
              Array.isArray(park.amenities) &&
              park.amenities.some((am) => am?.title?.toLowerCase().includes(term));
            const regionMatch = park.region?.toLowerCase().includes(term) || false;
            return titleMatch || activityMatch || amenityMatch || regionMatch;
          })
        : parks
    );
    setCurrentPage(1);
    scrollToTop();
  };

  const sortParksByProximity = (list: ParkLocation[], userLat: number, userLon: number): ParkLocation[] => {
    const withLoc: ParkLocation[] = [];
    const withoutLoc: ParkLocation[] = [];
    for (const p of list) (p.latitude !== null && p.longitude !== null ? withLoc : withoutLoc).push(p);

    withLoc.sort((a, b) => {
      const u = { latitude: userLat, longitude: userLon };
      const da = distanceMeters(u, { latitude: a.latitude!, longitude: a.longitude! });
      const db = distanceMeters(u, { latitude: b.latitude!, longitude: b.longitude! });
      return da - db;
    });

    return [...withLoc, ...withoutLoc];
  };

  const fetchParks = async () => {
    try {
      setLoading(true);
      setErrorKey(null);

      const userLoc = await getUserLocation();
      if (userLoc) setUserLocation(userLoc);

      const { data, error } = await supabase.from("all_parks").select("*");
      if (error) throw error;

      if (data) {
        const transformed: ParkLocation[] = data.map((item) => ({
          title: item.title || t("walking.parks.untitled"),
          url: item.url || "",
          image: item.image || "",
          region: item.region || "",
          hours: item.hours || t("walking.parks.noHours"),
          activities: Array.isArray(item.activities) ? item.activities : [],
          amenities: Array.isArray(item.amenities) ? item.amenities : [],
          latitude: item.latitude,
          longitude: item.longitude,
          scraped_at: item.scraped_at || "",
          description: item.description || null,
        }));

        let list = transformed;
        if (userLoc) {
          list = sortParksByProximity(transformed, userLoc.latitude, userLoc.longitude);
        } else {
          list = transformed.sort((a, b) => a.title.localeCompare(b.title));
        }

        setParks(list);
        setFilteredParks(list);
        setCurrentPage(1);
        scrollToTop();
      }
    } catch {
      setErrorKey("walking.error");
      Alert.alert(t("common.error"), t("walking.errors.dbLoadFailed"));
    } finally {
      setInitialLoading(false);
      setLoading(false);
      setRefreshing(false);
    }
  };

  const performSearch = (query: string) => {
    if (!query.trim()) {
      applyFilters(parks, tempFilters);
      setCurrentPage(1);
      return;
    }
    const term = query.toLowerCase().trim();
    const filtered = parks.filter((park) => {
      const titleMatch = park.title?.toLowerCase().includes(term) || false;
      const activityMatch =
        Array.isArray(park.activities) &&
        park.activities.some((a) => a?.title?.toLowerCase().includes(term));
      const amenityMatch =
        Array.isArray(park.amenities) &&
        park.amenities.some((am) => am?.title?.toLowerCase().includes(term));
      const regionMatch = park.region?.toLowerCase().includes(term) || false;
      return titleMatch || activityMatch || amenityMatch || regionMatch;
    });
    applyFilters(filtered, tempFilters);
    setCurrentPage(1);
    scrollToTop();
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    performSearch(query);
  };

  const handleSearchButton = () => performSearch(searchQuery);

  const onRefresh = () => {
    setRefreshing(true);
    setLoading(true);
    fetchParks();
  };

  useEffect(() => {
    (async () => {
      setInitialLoading(true);
      await fetchParks();
    })();
  }, []);

  const handleParkSelect = (park: ParkLocation) => {
    setSelectedPark(park);
    setShowParkDetails(true);
  };

  const handleCloseParkDetails = () => {
    setShowParkDetails(false);
    setSelectedPark(null);
  };

  const handleGetDirections = (park: ParkLocation) => {
  setShowParkDetails(false);
  setSelectedPark(null);
  
  if (park.latitude !== null && park.longitude !== null) {
    router.push({
      pathname: "/tabs/Navigation",
      params: { 
        presetLat: park.latitude.toString(),
        presetLng: park.longitude.toString(),
        autoStart: "1" 
      },
    });
  } else {
    // Fallback to name search only if coordinates are missing
    const q = park.title?.trim();
    if (!q) {
      Alert.alert(t("community.getDirections"), t("alerts.genericFailBody"));
      return;
    }
    
    router.push({
      pathname: "/tabs/Navigation",
      params: { 
        presetQuery: q, 
        autoStart: "1" 
      },
    });
  }
};

  const getFilterSections = (): FilterSection[] => {
    const activityOptions = Object.values(t("walking.filters.activities", { returnObjects: true }));
    const amenityOptions = Object.values(t("walking.filters.amenities", { returnObjects: true }));
    const regionOptions = Object.values(t("walking.filters.regions", { returnObjects: true }));

    return [
      {
        id: "activities",
        type: "chips-multi",
        title: t("walking.filters.categories.activity"),
        options: activityOptions.map((o) => ({ key: o, label: o })),
        selected: tempFilters.activities,
        onToggle: (key) =>
          setTempFilters((prev) => ({
            ...prev,
            activities: prev.activities.includes(key)
              ? prev.activities.filter((i) => i !== key)
              : [...prev.activities, key],
          })),
      },
      {
        id: "amenities",
        type: "chips-multi",
        title: t("walking.filters.categories.amenity"),
        options: amenityOptions.map((o) => ({ key: o, label: o })),
        selected: tempFilters.amenities,
        onToggle: (key) =>
          setTempFilters((prev) => ({
            ...prev,
            amenities: prev.amenities.includes(key)
              ? prev.amenities.filter((i) => i !== key)
              : [...prev.amenities, key],
          })),
      },
      {
        id: "regions",
        type: "chips-multi",
        title: t("walking.filters.categories.region"),
        options: regionOptions.map((o) => ({ key: o, label: o })),
        selected: tempFilters.regions,
        onToggle: (key) =>
          setTempFilters((prev) => ({
            ...prev,
            regions: prev.regions.includes(key)
              ? prev.regions.filter((i) => i !== key)
              : [...prev.regions, key],
          })),
      },
    ];
  };

  const renderParkItem = ({ item }: { item: ParkLocation }) => {
    const activitiesCount = item.activities?.length || 0;
    const amenitiesCount = item.amenities?.length || 0;

    const config = listItemConfig.parks;
    const metadata = config.getMetadata(t, activitiesCount, amenitiesCount);
    const finalMetadata = metadata === t("walking.parks.viewDetails") ? "" : metadata;

    const distanceText =
      userLocation && item.latitude && item.longitude
        ? t("walking.location.away", {
            distance: kmStr(distanceMeters(userLocation, {
              latitude: item.latitude,
              longitude: item.longitude,
            })),
          })
        : "";

    const subtitle = item.region
      ? distanceText
        ? `${item.region} • ${distanceText}`
        : item.region
      : distanceText;

    const regionColor = colorForRegion(item.region);
    return (
      <ListItem
        title={item.title}
        image={item.image}
        placeholderIcon="park"
        subtitle={subtitle}
        details={item.hours}
        metadata={finalMetadata}
        showArrow
        onPress={() => handleParkSelect(item)}
        imageResizeMode="cover"
        buttonBgColor={regionColor}
        buttonBgColorActive={regionColor}
        buttonBorderColor="#000"
        buttonBorderColorActive="#000"
      />
    );
  };

  if (errorKey) {
    return (
      <SafeAreaView style={s.safe}>
        <TopBar
          language={i18n.language as LangCode}
          setLanguage={setLang as (c: LangCode) => void}
          bgColor="#FFD3CD"
          title={t("walking.title")}
          includeTopInset
          barHeight={44}
          topPadding={2}
          onLogout={async () => {
            await logout();
            router.replace("/Authentication/Welcome");
          }}
        />
        <View style={s.errorContainer}>
          <AppText variant="body" weight="600" style={s.errorText}>
            {t(errorKey)}
          </AppText>
          <TouchableOpacity style={s.retryButton} onPress={fetchParks}>
            <AppText variant="button" weight="700" style={s.retryButtonText}>
              {t("walking.retry")}
            </AppText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["left", "right"]}>
      <TopBar
        leftMode="back"
        backTo="/tabs/Activities"
        language={i18n.language as LangCode}
        setLanguage={setLang as (c: LangCode) => void}
        bgColor="#FFD3CD"
        includeTopInset
        barHeight={44}
        topPadding={2}
        title={t("walking.title")}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/Welcome");
        }}
      />

      <SearchBar
        value={searchQuery}
        placeholder={t("walking.search.placeholder")}
        onChangeText={handleSearch}
        onSubmit={handleSearchButton}
        onPressFilter={handleOpenFilters}
        style={s.searchBar}
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
          <View style={s.summaryChipsRow}>
            <SummaryChip
              items={selectedFilterItems}
              variant="indigo"
              dense
              onItemPress={(item) => {
                setTempFilters((prev) => ({
                  activities: prev.activities.filter((i) => i !== item),
                  amenities: prev.amenities.filter((i) => i !== item),
                  regions: prev.regions.filter((i) => i !== item),
                }));
                setSelectedFilterItems((prev) => prev.filter((i) => i !== item));
                applyFilters(
                  searchQuery
                    ? parks.filter((park) => {
                        const term = searchQuery.toLowerCase();
                        const titleMatch = park.title?.toLowerCase().includes(term) || false;
                        const activityMatch =
                          Array.isArray(park.activities) &&
                          park.activities.some((a) => a?.title?.toLowerCase().includes(term));
                        const amenityMatch =
                          Array.isArray(park.amenities) &&
                          park.amenities.some((am) => am?.title?.toLowerCase().includes(term));
                        const regionMatch = park.region?.toLowerCase().includes(term) || false;
                        return titleMatch || activityMatch || amenityMatch || regionMatch;
                      })
                    : parks,
                  {
                    ...tempFilters,
                    activities: tempFilters.activities.filter((i) => i !== item),
                    amenities: tempFilters.amenities.filter((i) => i !== item),
                    regions: tempFilters.regions.filter((i) => i !== item),
                  }
                );
                setCurrentPage(1);
                scrollToTop();
              }}
            />
          </View>
        </View>
      )}

      <FilterSheet
        visible={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        sections={getFilterSections()}
        onReset={handleResetFilters}
        onApply={handleApplyFilters}
        title={t("walking.filter.title")}
        labels={{
          reset: t("walking.filter.reset"),
          apply: t("walking.filter.apply"),
        }}
      />
      <FlatList
        ref={flatListRef}
        data={currentParks}
        renderItem={renderParkItem}
        keyExtractor={(item) => item.title}
        contentContainerStyle={[
          s.listContainer,
          { paddingBottom: filteredParks.length > 0 ? 0 : bottomPad },
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
        ListFooterComponent={
          filteredParks.length > 0 ? (
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
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            {initialLoading || loading ? (
              <>
                <ActivityIndicator size="small" color="#007AFF" />
                <AppText variant="body" weight="400" style={s.emptyText}>
                  {t("walking.loading")}
                </AppText>
              </>
            ) : (
              <>
                <AppText variant="body" weight="400" style={s.emptyText}>
                  {searchQuery || selectedFilterItems.length > 0
                    ? t("walking.parks.emptySearch")
                    : t("walking.parks.emptyDatabase")}
                </AppText>
                <TouchableOpacity style={s.retryButton} onPress={fetchParks}>
                  <AppText variant="button" weight="700" style={s.retryButtonText}>
                    {t("walking.parks.tryAgain")}
                  </AppText>
                </TouchableOpacity>
              </>
            )}
          </View>
        }
      />
      <ItemDetailsModal
        park={selectedPark}
        visible={showParkDetails}
        onClose={handleCloseParkDetails}
        userLocation={userLocation || undefined}
        onGetDirections={handleGetDirections}
        distanceMeters={distanceMeters}
        kmStr={kmStr}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFAF0" },

  searchBar: { margin: 16 },

  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexGrow: 1,
  },

  parkTitle: {
    marginBottom: 8,
    fontSize: 18,
    color: "#2C3E50",
  },

  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  errorText: { textAlign: "center", marginBottom: 16, color: "#DC3545" },
  retryButton: { backgroundColor: "#007AFF", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  retryButtonText: { color: "#FFF" },

  emptyContainer: { padding: 40, alignItems: "center" },
  emptyText: { textAlign: "center", marginBottom: 16, color: "#6C757D" },

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