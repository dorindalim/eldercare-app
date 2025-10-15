import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from 'expo-location';
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, FlatList, Image, Linking, RefreshControl, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import FilterSheet, { type FilterSection } from "../../src/components/FilterSheet";
import Pagination from '../../src/components/Pagination';
import ParkDetailsModal from "../../src/components/ParkDetailsModal";
import SearchBar from '../../src/components/SearchBar';
import SummaryChip from "../../src/components/SummaryChip";
import TopBar, { type LangCode } from "../../src/components/TopBar";
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
};

type LatLng = {
  latitude: number;
  longitude: number;
};

// Calculate distance between two coordinates using Haversine formula
const distanceMeters = (a: LatLng, b: LatLng) => {
  const R = 6371e3;
  const φ1 = (a.latitude * Math.PI) / 180;
  const φ2 = (b.latitude * Math.PI) / 180;
  const Δφ = ((b.latitude - a.latitude) * Math.PI) / 180;
  const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

// Convert meters to kilometers
const kmStr = (m?: number | null) =>
  m == null ? "" : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;

export default function WalkingScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  
  const flatListRef = useRef<FlatList>(null);
  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({ animated: true, offset: 0 });
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    scrollToTop(); // Scroll to top when page changes
  };
  
  const setLang = async (code: string) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  const [parks, setParks] = useState<ParkLocation[]>([]);
  const [filteredParks, setFilteredParks] = useState<ParkLocation[]>([]);
  const [selectedPark, setSelectedPark] = useState<ParkLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [userLocation, setUserLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [showParkDetails, setShowParkDetails] = useState(false);

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [tempFilters, setTempFilters] = useState({
    activities: [] as string[],
    amenities: [] as string[], 
    regions: [] as string[],
  });
  const [selectedFilterItems, setSelectedFilterItems] = useState<string[]>([]);

  // Get user's current location
  const getUserLocation = async (): Promise<{latitude: number; longitude: number} | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Location permission denied');
        return null;
      }

      const pos = await Location.getCurrentPositionAsync({});
      return { 
        latitude: pos.coords.latitude, 
        longitude: pos.coords.longitude 
      };
    } catch (error) {
      console.warn('Could not get user location:', error);
      return null;
    }
  };

  // Update selected filter items for SummaryChip
  const updateSelectedFilterItems = () => {
    const items: string[] = [];
    Object.values(tempFilters).forEach(category => {
      items.push(...category);
    });
    setSelectedFilterItems(items);
  };

  // Apply filters function
  const applyFilters = (parkList: ParkLocation[], filters: typeof tempFilters) => {
    const hasActiveFilters = Object.values(filters).some(category => category.length > 0);
    
    if (!hasActiveFilters) {
      setFilteredParks(parkList);
      return;
    }

    const scoredParks = parkList.map(park => {
      let score = 0;
      
      // Activity filters
      filters.activities.forEach(selectedActivity => {
        if (Array.isArray(park.activities)) {
          park.activities.forEach(activity => {
            if (activity?.title === selectedActivity) {
              score += 1;
            }
          });
        }
      });
      
      // Amenity filters
      filters.amenities.forEach(selectedAmenity => {
        if (Array.isArray(park.amenities)) {
          park.amenities.forEach(amenity => {
            if (amenity?.title === selectedAmenity) {
              score += 1;
            }
          });
        }
      });
      
      // Region filters
      filters.regions.forEach(selectedRegion => {
        if (park.region === selectedRegion) {
          score += 1;
        }
      });
      
      return { park, score };
    });

    const sortedParks = scoredParks
      .filter(item => item.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return parkList.indexOf(a.park) - parkList.indexOf(b.park);
      })
      .map(item => item.park);

    setFilteredParks(sortedParks);
  };

  // Handle opening filter panel
  const handleOpenFilters = () => {
    setShowFilterPanel(true);
  };

  // Handle applying filters
  const handleApplyFilters = () => {
    applyFilters(
      searchQuery ? parks.filter(park => {
        const searchTerm = searchQuery.toLowerCase();
        const titleMatch = park.title?.toLowerCase().includes(searchTerm) || false;
        const activityMatch = Array.isArray(park.activities) && 
          park.activities.some(activity => 
            activity?.title?.toLowerCase().includes(searchTerm)
          );
        const amenityMatch = Array.isArray(park.amenities) &&
          park.amenities.some(amenity => 
            amenity?.title?.toLowerCase().includes(searchTerm)
          );
        const regionMatch = park.region?.toLowerCase().includes(searchTerm) || false;
        return titleMatch || activityMatch || amenityMatch || regionMatch;
      }) : parks,
      tempFilters
    );
    setShowFilterPanel(false);
    updateSelectedFilterItems();
  };

  // Handle resetting filters
  const handleResetFilters = () => {
    setTempFilters({
      activities: [],
      amenities: [],
      regions: [],
    });
  };

  // Handle clearing all filters (for SummaryChip)
  const clearAllFilters = () => {
    handleResetFilters();
    setSelectedFilterItems([]);
    setFilteredParks(searchQuery ? 
      parks.filter(park => {
        const searchTerm = searchQuery.toLowerCase();
        const titleMatch = park.title?.toLowerCase().includes(searchTerm) || false;
        const activityMatch = Array.isArray(park.activities) && 
          park.activities.some(activity => 
            activity?.title?.toLowerCase().includes(searchTerm)
          );
        const amenityMatch = Array.isArray(park.amenities) &&
          park.amenities.some(amenity => 
            amenity?.title?.toLowerCase().includes(searchTerm)
          );
        const regionMatch = park.region?.toLowerCase().includes(searchTerm) || false;
        return titleMatch || activityMatch || amenityMatch || regionMatch;
      }) : parks
    );
  };

  // Sort parks by proximity to user location
  const sortParksByProximity = (parks: ParkLocation[], userLat: number, userLon: number): ParkLocation[] => {
    const parksWithLocation: ParkLocation[] = [];
    const parksWithoutLocation: ParkLocation[] = [];

    // Separate parks with and without coordinates
    parks.forEach(park => {
      if (park.latitude !== null && park.longitude !== null) {
        parksWithLocation.push(park);
      } else {
        parksWithoutLocation.push(park);
      }
    });

    // Sort parks with coordinates by distance using distanceMeters
    const sortedParksWithLocation = parksWithLocation.sort((a, b) => {
      const userLocation = { latitude: userLat, longitude: userLon };

      // Check that location not null 
      if (!a.latitude || !a.longitude || !b.latitude || !b.longitude) {return 0; }
      
      const distanceA = distanceMeters(userLocation, { latitude: a.latitude!, longitude: a.longitude! });
      const distanceB = distanceMeters(userLocation, { latitude: b.latitude!, longitude: b.longitude! });
      return distanceA - distanceB;
    });

    // Return sorted parks with location first, then parks without location
    return [...sortedParksWithLocation, ...parksWithoutLocation];
  };

  const [initialLoading, setInitialLoading] = useState(true);

  // Fetch parks from Supabase
  const fetchParks = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to get user location first
      const userLoc = await getUserLocation();
      if (userLoc) {
        setUserLocation(userLoc);
      }
      const { data, error } = await supabase
        .from('all_parks')
        .select('*');

      if (error) {
        throw error;
      }

      if (data) {
        const transformedData: ParkLocation[] = data.map(item => ({
          title: item.title || 'Untitled Park',
          url: item.url || '',
          image: item.image || '',
          region: item.region || '',
          hours: item.hours || 'Hours not available',
          activities: Array.isArray(item.activities) ? item.activities : [],
          amenities: Array.isArray(item.amenities) ? item.amenities : [],
          latitude: item.latitude,
          longitude: item.longitude,
          scraped_at: item.scraped_at || ''
        }));

        let sortedData = transformedData;

        // Sort by proximity if user location is available
        if (userLoc) {
          sortedData = sortParksByProximity(transformedData, userLoc.latitude, userLoc.longitude);
        } else {
          // Fallback: sort by title alphabetically
          sortedData = transformedData.sort((a, b) => a.title.localeCompare(b.title));
        }

        setParks(sortedData);
        setFilteredParks(sortedData);
      }
    } catch (err) {
      console.error('Error fetching parks:', err);
      setError('Failed to load parks');
      Alert.alert('Error', 'Failed to load parks from database');
    } finally {
      setInitialLoading(false);
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Clear screen each time
  const clearAllSearchAndFilters = () => {
    // Clear search query
    setSearchQuery("");
  
    // Clear all filter selections
    handleResetFilters();
    setSelectedFilterItems([]);
    
    // Reset to show all parks
    setFilteredParks(parks);
  };

  // Search functionality
  const performSearch = (query: string) => {
    if (!query.trim()) {
      // If search is empty, reset to all parks
      applyFilters(parks, tempFilters);
      return;
    }

    const searchTerm = query.toLowerCase().trim();

    const filtered = parks.filter(park => {
      // Check park title (with safe fallback)
      const titleMatch = park.title?.toLowerCase().includes(searchTerm) || false;
      
      // Check activities array - search in activity titles
      const activityMatch = Array.isArray(park.activities) && 
        park.activities.some(activity => 
          activity?.title?.toLowerCase().includes(searchTerm)
        );
      
      // Check amenities array - search in amenity titles
      const amenityMatch = Array.isArray(park.amenities) &&
        park.amenities.some(amenity => 
          amenity?.title?.toLowerCase().includes(searchTerm)
        );
      
      // Check region (with safe fallback)
      const regionMatch = park.region?.toLowerCase().includes(searchTerm) || false;

      return titleMatch || activityMatch || amenityMatch || regionMatch;
    });
    
    applyFilters(filtered, tempFilters);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    performSearch(query);
  };

  const handleSearchButton = () => {
    performSearch(searchQuery);
  };

  // Pull to refresh handler
  const onRefresh = () => {
    setRefreshing(true);
    setLoading(true);
    fetchParks();
  };

  useEffect(() => {
  const loadData = async () => {
    setInitialLoading(true);
    await fetchParks();
  };
  loadData();
  }, []);

  // Updated park selection handler
  const handleParkSelect = (park: ParkLocation) => {
    setSelectedPark(park);
    setShowParkDetails(true); // Show the modal instead of navigating
  };

  const handleCloseParkDetails = () => {
    setShowParkDetails(false);
    setSelectedPark(null);
  };

  const handleGetDirections = (park: ParkLocation) => {
    try {
      setShowParkDetails(false);
      setSelectedPark(null);
      
      console.log('Navigating to Navigation with park:', park.title);

      if (!park.title) {
        Alert.alert('Error', 'Park name is required for directions');
        return;
      }
      
      // Build the href with proper URL encoding
      let href = `/tabs/Navigation?presetQuery=${encodeURIComponent(park.title.trim())}`;
      
      // Add coordinates if available
      if (park.latitude && park.longitude) {
        href += `&presetLat=${park.latitude}&presetLng=${park.longitude}`;
      }
      
      console.log('Navigating to:', href);
      router.push({
        pathname: "/tabs/Navigation",
        params: { 
          presetQuery: park.title.trim(),
          freshStart: "true",
          fillOnly: "true",
          ...(park.latitude && park.longitude && {
            presetLat: park.latitude.toString(),
            presetLng: park.longitude.toString()
          })
        }
      });
      
    } catch (error) {
      console.error('Error navigating to directions:', error);
      Alert.alert('Error', 'Failed to open navigation');
    }
  };

  const handleUrlPress = async (url: string) => {
    if (!url) return;
    
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Cannot open this URL');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to open URL');
    }
  };

  // Create filter sections for FilterSheet
  const getFilterSections = (): FilterSection[] => {
    const activityOptions = Object.values(t('walking.filters.activities', { returnObjects: true }));
    const amenityOptions = Object.values(t('walking.filters.amenities', { returnObjects: true }));
    const regionOptions = Object.values(t('walking.filters.regions', { returnObjects: true }));

    return [
      {
        id: "activities",
        type: "chips-multi",
        title: "Activities",
        options: activityOptions.map(option => ({ key: option, label: option })),
        selected: tempFilters.activities,
        onToggle: (key) => {
          setTempFilters(prev => ({
            ...prev,
            activities: prev.activities.includes(key) 
              ? prev.activities.filter(item => item !== key)
              : [...prev.activities, key]
          }));
        },
      },
      {
        id: "amenities",
        type: "chips-multi", 
        title: "Amenities",
        options: amenityOptions.map(option => ({ key: option, label: option })),
        selected: tempFilters.amenities,
        onToggle: (key) => {
          setTempFilters(prev => ({
            ...prev,
            amenities: prev.amenities.includes(key)
              ? prev.amenities.filter(item => item !== key)
              : [...prev.amenities, key]
          }));
        },
      },
      {
        id: "regions",
        type: "chips-multi",
        title: "Regions", 
        options: regionOptions.map(option => ({ key: option, label: option })),
        selected: tempFilters.regions,
        onToggle: (key) => {
          setTempFilters(prev => ({
            ...prev,
            regions: prev.regions.includes(key)
              ? prev.regions.filter(item => item !== key)
              : [...prev.regions, key]
          }));
        },
      },
    ];
  };

  const renderParkItem = ({ item }: { item: ParkLocation }) => (
    <TouchableOpacity 
      style={[
        s.parkItem,
        selectedPark?.title === item.title && s.selectedParkItem
      ]} 
      onPress={() => handleParkSelect(item)}
    >
      {/* Park Image */}
      {item.image ? (
        <Image 
          source={{ uri: item.image }} 
          style={s.parkImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[s.parkImage, s.noImage]}>
          <AppText variant="caption" weight="400" style={s.noImageText}>
            No Image
          </AppText>
        </View>
      )}
      
      {/* Park Title with Distance */}
      <View style={s.titleContainer}>
        <AppText variant="title" weight="700" style={s.parkTitle}>
          {item.title}
        </AppText>
        {userLocation && item.latitude && item.longitude && (
          <AppText variant="caption" weight="600" style={s.distanceText}>
            ({kmStr(
              distanceMeters(
                userLocation, 
                { latitude: item.latitude, longitude: item.longitude }
              )
            )} away)
          </AppText>
        )}
      </View>
      
      {/* Hours */}
      <View style={s.hoursContainer}>
        <AppText variant="caption" weight="600" style={s.hoursLabel}>
          {item.hours}
        </AppText>
      </View>
      
      {/* Region */}
      {item.region && (
        <View style={s.regionContainer}>
          <AppText variant="caption" weight="600" style={s.regionText}>
            Region: {item.region}
          </AppText>
        </View>
      )}
      
      {/* Activities & Amenities Count - Combined */}
      {(item.activities?.length > 0 || item.amenities?.length > 0) && (
        <View style={s.combinedCountContainer}>
          <AppText variant="caption" weight="600" style={s.combinedCountText}>
            {item.activities?.length || 0} activit{item.activities?.length !== 1 ? 'ies ' : 'y '} 
            and {item.amenities?.length || 0} amenit{item.amenities?.length !== 1 ? 'ies' : 'y'} available
          </AppText>
        </View>
      )}
            
      {/* URL - Make it clickable */}
      {item.url && (
        <TouchableOpacity 
          onPress={() => handleUrlPress(item.url)}
          style={s.urlContainer}
        >
          <AppText variant="caption" weight="600" style={s.urlText} numberOfLines={1}>
            🔗 Learn more at NParks.gov.sg
          </AppText>
        </TouchableOpacity>
      )}
      
      {/* Get Directions Button - Make it a separate TouchableOpacity */}
      <TouchableOpacity 
        style={s.directionButton}
        onPress={() => handleGetDirections(item)}
      >
        <AppText variant="button" weight="400" style={s.directionButtonText}>
          Get Directions
        </AppText>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  // Calculate tabs data based on filtered parks
  const parksPerPage = 10;
  const totalPages = Math.ceil(filteredParks.length / parksPerPage);
  const currentParks = filteredParks.slice(
    (currentPage - 1) * parksPerPage,
    currentPage * parksPerPage
  );

  if (error) {
    return (
      <SafeAreaView style={s.safe}>
        <TopBar
          language={i18n.language as LangCode}
          setLanguage={setLang as (c: LangCode) => void}
          bgColor="#D9D991"
          title={t("walkingRoutes.title")}
          includeTopInset={true}
          barHeight={44}
          topPadding={2}
          onLogout={async () => {
            await logout();
            router.replace("/Authentication/LogIn");
          }}
        />
        <View style={s.errorContainer}>
          <AppText variant="body" weight="600" style={s.errorText}>
            {error}
          </AppText>
          <TouchableOpacity style={s.retryButton} onPress={fetchParks}>
            <AppText variant="button" weight="700" style={s.retryButtonText}>
              Retry
            </AppText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["left", "right"]}>
      {/* Top Bar */}
      <TopBar
        leftMode="back"
        backTo="/tabs/Activities"     
        language={i18n.language as LangCode}
        setLanguage={setLang as (c: LangCode) => void}
        bgColor="#D9D991"
        includeTopInset={true}
        barHeight={44}
        topPadding={2}
        title={t("walkingRoutes.title")}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/LogIn");
        }}
      />

      {/* Combined Search and Filter Bar */}
      <View style={s.searchBarContainer}>
        <SearchBar
          value={searchQuery}
          placeholder="Search parks by name/activity/region"
          onChangeText={handleSearch}
          onSubmit={handleSearchButton}
          onPressFilter={handleOpenFilters}
          style={s.searchBar}
        />
      </View>

      {/* Selected Filters Summary */}
      {selectedFilterItems.length > 0 && (
        <View style={s.summaryChipContainer}>
          <View style={s.summaryChipHeader}>
            <AppText variant="caption" weight="600" style={s.summaryChipTitle}>
              Active Filters:
            </AppText>
            <TouchableOpacity 
              onPress={clearAllFilters}
              style={s.clearAllButton}
            >
              <AppText variant="caption" weight="600" style={s.clearAllText}>
                Clear All
              </AppText>
            </TouchableOpacity>
          </View>
          <View style={s.summaryChipsRow}>
            <SummaryChip
              items={selectedFilterItems}
              variant="indigo"
              dense={true}
              onItemPress={(item) => {
                // Remove individual filter item
                setTempFilters(prev => ({
                  activities: prev.activities.filter(i => i !== item),
                  amenities: prev.amenities.filter(i => i !== item),
                  regions: prev.regions.filter(i => i !== item),
                }));
              }}
            />
          </View>
        </View>
      )}

      {/* Filter Sheet */}
      <FilterSheet
        visible={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        sections={getFilterSections()}
        onReset={handleResetFilters}
        onApply={handleApplyFilters}
        title="Filter Parks"
        labels={{
          reset: "Reset Filters",
          apply: "Apply Filters"
        }}
      />
      
      {/* Parks List */}
      <FlatList
        ref={flatListRef}
        data={currentParks}
        renderItem={renderParkItem}
        keyExtractor={(item) => item.title}
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
        ListFooterComponent={
          filteredParks.length > 0 ? (
            <Pagination 
              page={currentPage}
              total={totalPages}
              onChange={handlePageChange}
            />
          ) : null
        }
        ListFooterComponentStyle={{ padding: 16 }}
        ListEmptyComponent={
        <View style={s.emptyContainer}>
          {initialLoading ? (
            <>
              <ActivityIndicator size="small" color="#007AFF" />
              <AppText variant="body" weight="400" style={s.emptyText}>
                Loading parks...
              </AppText>
            </>
          ) : (
            <>
              <AppText variant="body" weight="400" style={s.emptyText}>
                {searchQuery || selectedFilterItems.length > 0 
                  ? "No parks match your search criteria" 
                  : "No parks found in database"
                }
              </AppText>
              <TouchableOpacity style={s.retryButton} onPress={fetchParks}>
                <AppText variant="button" weight="700" style={s.retryButtonText}>
                  Try Again
                </AppText>
              </TouchableOpacity>
            </>
          )}
        </View>
      }
      />

      {/* Park Details Modal */}
      <ParkDetailsModal
        park={selectedPark}
        visible={showParkDetails}
        onClose={handleCloseParkDetails}
        userLocation={userLocation}
        onGetDirections={handleGetDirections}
        distanceMeters={distanceMeters}
        kmStr={kmStr}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { 
    flex: 1, 
    backgroundColor: "#F8F9FA" 
  },

  // Search Input
  searchBarContainer: {
    padding: 16,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
  },
  searchBar: {},

  // List
  listContainer: {
    padding: 16,
    flexGrow: 1,
  },

  // Park Item
  parkItem: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  selectedParkItem: {
    borderColor: "#007AFF",
    backgroundColor: "#F0F8FF",
  },
  parkImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginBottom: 12,
  },
  noImage: {
    backgroundColor: "#E9ECEF",
    justifyContent: "center",
    alignItems: "center",
  },
  noImageText: {
    color: "#6C757D",
  },
  titleContainer: {
    marginBottom: 8,
  },
  parkTitle: {
    marginBottom: 4,
  },
  distanceText: {
    color: "#6C757D",
    fontSize: 14,
  },
  hoursContainer: {
    marginBottom: 8,
  },
  hoursLabel: {
    color: "#28A745",
    marginBottom: 2,
  },
  regionContainer: {
    marginBottom: 12,
  },
  regionText: {
    color: "#495057",
  },
  urlContainer: {
    marginBottom: 12,
    padding: 8,
    backgroundColor: "#F8F9FA",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E9ECEF",
  },
  urlText: {
    color: "#007AFF",
  },
  directionButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  directionButtonText: {
    color: "#FFF",
  },

  // Loading & Error States
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
  retryButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#FFF",
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
  combinedCountContainer: {
    marginBottom: 8,
    padding: 6,
    backgroundColor: '#E7F3FF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#007AFF',
    alignSelf: 'flex-start',
  },
  combinedCountText: {
    color: '#007AFF',
    fontSize: 12,
  },
  // Summary Chip Styles
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
  summaryChipTitle: {
    color: "#6B7280",
    fontSize: 14,
  },
  clearAllButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearAllText: {
    color: "#EF4444",
    fontSize: 14,
  },
  summaryChipsRow: {
    flexDirection: "row",
  },
});