import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from 'expo-location';
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, FlatList, Image, Linking, RefreshControl, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import ParkDetailsModal from "../../src/components/ParkDetailsModal";
import TopBar, { type LangCode } from "../../src/components/TopBar";
import { supabase } from "../../src/lib/supabase";

type ParkLocation = {
  title: string;
  url: string;
  image: string;
  region: string;
  hours: string;
  activities: string[];
  amenities: string[];
  latitude: number | null;
  longitude: number | null;
  scraped_at: string;
};

type FilterCategory = {
  name: string;
  options: string[];
  selected: string[];
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
  
  const flatListRef = useRef<FlatList>(null);
  
  const setLang = async (code: string) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  const [parks, setParks] = useState<ParkLocation[]>([]);
  const [filteredParks, setFilteredParks] = useState<ParkLocation[]>([]);
  const [selectedPark, setSelectedPark] = useState<ParkLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [userLocation, setUserLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [showParkDetails, setShowParkDetails] = useState(false);

  // Filter categories
  const [filters, setFilters] = useState<FilterCategory[]>([
    {
      name: "activity",
      options: ["Barbecuing", "Birdwatching", "Camping", "Contemplative landscape", "Cycling or inline skating", "Dining", "Fishing", "Fitness Studio", "Fun with children", "Fun with your dog", "Hiking", "Nature walks or tours", "Photography", "Shopping", "Therapeutic gardens", "Wellness"],
      selected: []
    },
    {
      name: "amenity",
      options: ["Restrooms", "Parking", "Picnic Area", "Walking Trails", "Drinking Fountain", "Allotment Garden", "Art or Exhibition Space", "Bird Perch", "Community Garden", "Dining", "Fishing Facility", "Therapeutic Garden", "Venue for Booking", "Wellness Provider"],
      selected: []
    },
    {
      name: "region",
      options: ["Central", "East", "North", "South", "West", "Offshore islands"],
      selected: []
    }
  ]);

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

  const [locationLoading, setLocationLoading] = useState(false);

  // Fetch parks from Supabase
  const fetchParks = async () => {
    try {
      setLoading(true);
      setLocationLoading(true);
      setError(null);

      // Try to get user location first
      const userLoc = await getUserLocation();
      setLocationLoading(false);
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
      setLocationLoading(false);
      console.error('Error fetching parks:', err);
      setError('Failed to load parks');
      Alert.alert('Error', 'Failed to load parks from database');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Search functionality
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      applyFilters(parks, filters);
      return;
    }

    const searchTerm = query.toLowerCase().trim();

    const filtered = parks.filter(park => {
      // Check park title (with safe fallback)
      const titleMatch = park.title?.toLowerCase().includes(searchTerm) || false;
      
      // Check activities array (with safe fallback for undefined)
      const activityMatch = Array.isArray(park.activities) && 
      park.activities.some(activity => 
        activity?.toLowerCase().includes(searchTerm)
      );
      
      // Check amenities array (with safe fallback for undefined)  
      const amenityMatch = Array.isArray(park.amenities) &&
      park.amenities.some(amenity => 
        amenity?.toLowerCase().includes(searchTerm)
      );
      
      // Check region (with safe fallback)
      const regionMatch = park.region?.toLowerCase().includes(searchTerm) || false;

      return titleMatch || activityMatch || amenityMatch || regionMatch;
    });
    
    applyFilters(filtered, filters);
  };

  // Search button handler
  const handleSearchButton = () => {
    if (!searchQuery.trim()) {
      // If search is empty, reset to all parks
      applyFilters(parks, filters);
      return;
    }

    const searchTerm = searchQuery.toLowerCase().trim();

    const filtered = parks.filter(park => {
      // Check park title (with safe fallback)
      const titleMatch = park.title?.toLowerCase().includes(searchTerm) || false;
      
      // Check activities array (with safe fallback for undefined)
      const activityMatch = Array.isArray(park.activities) && 
      park.activities.some(activity => 
        activity?.toLowerCase().includes(searchTerm)
      );
      
      // Check amenities array (with safe fallback for undefined)  
      const amenityMatch = Array.isArray(park.amenities) &&
      park.amenities.some(amenity => 
        amenity?.toLowerCase().includes(searchTerm)
      );
      
      // Check region (with safe fallback)
      const regionMatch = park.region?.toLowerCase().includes(searchTerm) || false;

      return titleMatch || activityMatch || amenityMatch || regionMatch;
    });
    
    applyFilters(filtered, filters);
  };

  // Filter functionality
  const toggleFilterOption = (categoryIndex: number, option: string) => {
    const updatedFilters = [...filters];
    const category = updatedFilters[categoryIndex];
    
    if (category.selected.includes(option)) {
      category.selected = category.selected.filter(item => item !== option);
    } else {
      category.selected.push(option);
    }
    
    setFilters(updatedFilters);
  };

  const applyFilters = (parkList: ParkLocation[], filterList: FilterCategory[]) => {
    const hasActiveFilters = filterList.some(category => category.selected.length > 0);
    
    if (!hasActiveFilters) {
      setFilteredParks(parkList);
      return;
    }

    const scoredParks = parkList.map(park => {
      let score = 0;
      
      filterList.forEach(category => {
        category.selected.forEach(selectedOption => {
          if (category.name === 'activity' && park.activities?.includes(selectedOption)) {
            score += 1;
          } else if (category.name === 'amenity' && park.amenities?.includes(selectedOption)) {
            score += 1;
          } else if (category.name === 'region' && park.region === selectedOption) {
            score += 1;
          }
        });
      });
      
      return { park, score };
    });

    // Sort by score descending, then maintain original proximity/title order
    const sortedParks = scoredParks
      .filter(item => item.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        // Maintain original order for parks with same score
        return parkList.indexOf(a.park) - parkList.indexOf(b.park);
      })
      .map(item => item.park);

    setFilteredParks(sortedParks);
  };

  const handleApplyFilters = () => {
    applyFilters(
      searchQuery ? parks.filter(park => 
        park.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        park.activities?.some(activity => 
          activity.toLowerCase().includes(searchQuery.toLowerCase())
        ) ||
        park.amenities?.some(amenity => 
          amenity.toLowerCase().includes(searchQuery.toLowerCase())
        ) ||
        park.region?.toLowerCase().includes(searchQuery.toLowerCase())
      ) : parks,
      filters
    );
    setShowFilters(false);
  };

  const handleClearFilters = () => {
    const resetFilters = filters.map(category => ({
      ...category,
      selected: []
    }));
    setFilters(resetFilters);
    setFilteredParks(searchQuery ? 
      parks.filter(park => 
        park.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        park.activities?.some(activity => 
          activity.toLowerCase().includes(searchQuery.toLowerCase())
        ) ||
        park.amenities?.some(amenity => 
          amenity.toLowerCase().includes(searchQuery.toLowerCase())
        ) ||
        park.region?.toLowerCase().includes(searchQuery.toLowerCase())
      ) : parks
    );
  };

  // Pull to refresh handler
  const onRefresh = () => {
    setRefreshing(true);
    fetchParks();
  };

  useEffect(() => {
    fetchParks();
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
    setShowParkDetails(false);
    setSelectedPark(null);
    
    router.push({
      pathname: "/tabs/Navigation",
      params: { 
        presetQuery: park.title
      }
    });
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
          Hours:
        </AppText>
        <AppText variant="caption" weight="400" style={s.hoursText}>
          {item.hours}
        </AppText>
      </View>
      
      {/* Region */}
      {item.region && (
        <View style={s.regionContainer}>
          <AppText variant="caption" weight="600" style={s.regionLabel}>
            Region:
          </AppText>
          <AppText variant="caption" weight="400" style={s.regionText}>
            {item.region}
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
      
      <View style={s.directionButton}>
        <AppText variant="button" weight="700" style={s.directionButtonText}>
          Get Directions
        </AppText>
      </View>
    </TouchableOpacity>
  );

  // Calculate tabs data based on filtered parks
  const parksPerTab = 10;
  const totalTabs = Math.ceil(filteredParks.length / parksPerTab);
  const currentParks = filteredParks.slice(
    currentTab * parksPerTab,
    (currentTab + 1) * parksPerTab
  );

  // Calculate visible page range (max 3 pages at a time)
  const getVisiblePages = () => {
    if (totalTabs <= 3) {
      return Array.from({ length: totalTabs }, (_, i) => i);
    }

    if (currentTab === 0) {
      return [0, 1, 2];
    } else if (currentTab === totalTabs - 1) {
      return [totalTabs - 3, totalTabs - 2, totalTabs - 1];
    } else {
      return [currentTab - 1, currentTab, currentTab + 1];
    }
  };

  const visiblePages = getVisiblePages();

  // Scroll to top function
  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({ animated: true, offset: 0 });
  };

  // Navigation handlers
  const goToFirstPage = () => {
    setCurrentTab(0);
    scrollToTop();
  };

  const goToLastPage = () => {
    setCurrentTab(totalTabs - 1);
    scrollToTop();
  };

  const goToPreviousPage = () => {
    setCurrentTab(prev => Math.max(0, prev - 1));
    scrollToTop();
  };

  const goToNextPage = () => {
    setCurrentTab(prev => Math.min(totalTabs - 1, prev + 1));
    scrollToTop();
  };

  const handleTabChange = (tabIndex: number) => {
    setCurrentTab(tabIndex);
    scrollToTop();
  };

  const renderTabButtons = () => {
    if (totalTabs <= 1) return null;
    
    return (
      <View style={s.tabContainer}>
        {/* Left Navigation Arrows */}
        <View style={s.navButtons}>
          <TouchableOpacity
            style={[
              s.navButton,
              currentTab === 0 && s.navButtonDisabled
            ]}
            onPress={goToFirstPage}
            disabled={currentTab === 0}
          >
            <AppText style={[
              s.navButtonText,
              currentTab === 0 && s.navButtonTextDisabled
            ]}>
              {'<<'}
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              s.navButton,
              currentTab === 0 && s.navButtonDisabled
            ]}
            onPress={goToPreviousPage}
            disabled={currentTab === 0}
          >
            <AppText style={[
              s.navButtonText,
              currentTab === 0 && s.navButtonTextDisabled
            ]}>
              {'<'}
            </AppText>
          </TouchableOpacity>
        </View>

        {/* Page Numbers */}
        <View style={s.pageNumbers}>
          {visiblePages.map((pageIndex) => (
            <TouchableOpacity
              key={pageIndex}
              style={[
                s.tabButton,
                currentTab === pageIndex && s.activeTabButton
              ]}
              onPress={() => handleTabChange(pageIndex)}
            >
              <AppText 
                variant="caption" 
                weight="700" 
                style={[
                  s.tabButtonText,
                  currentTab === pageIndex && s.activeTabButtonText
                ]}
              >
                {pageIndex + 1}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Right Navigation Arrows */}
        <View style={s.navButtons}>
          <TouchableOpacity
            style={[
              s.navButton,
              currentTab === totalTabs - 1 && s.navButtonDisabled
            ]}
            onPress={goToNextPage}
            disabled={currentTab === totalTabs - 1}
          >
            <AppText style={[
              s.navButtonText,
              currentTab === totalTabs - 1 && s.navButtonTextDisabled
            ]}>
              {'>'}
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              s.navButton,
              currentTab === totalTabs - 1 && s.navButtonDisabled
            ]}
            onPress={goToLastPage}
            disabled={currentTab === totalTabs - 1}
          >
            <AppText style={[
              s.navButtonText,
              currentTab === totalTabs - 1 && s.navButtonTextDisabled
            ]}>
              {'>>'}
            </AppText>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Filter Modal Component
  const FilterModal = () => (
    <View style={s.modalOverlay}>
      <View style={s.modalContent}>
        <View style={s.modalHeader}>
          <AppText variant="h2" weight="800" style={s.modalTitle}>
            Filter Parks
          </AppText>
          <TouchableOpacity onPress={() => setShowFilters(false)} style={s.closeButton}>
            <AppText variant="title" weight="700" style={s.closeButtonText}>
              ×
            </AppText>
          </TouchableOpacity>
        </View>

        <ScrollView style={s.filterContent}>
          {filters.map((category, categoryIndex) => (
            <View key={category.name} style={s.filterCategory}>
              <AppText variant="title" weight="700" style={s.categoryTitle}>
                {category.name.charAt(0).toUpperCase() + category.name.slice(1)}
              </AppText>
              <View style={s.optionsContainer}>
                {category.options.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      s.optionButton,
                      category.selected.includes(option) && s.optionButtonSelected
                    ]}
                    onPress={() => toggleFilterOption(categoryIndex, option)}
                  >
                    <AppText 
                      variant="body" 
                      weight="400" 
                      style={[
                        s.optionText,
                        category.selected.includes(option) && s.optionTextSelected
                      ]}
                    >
                      {option}
                    </AppText>
                    <View style={[
                      s.checkbox,
                      category.selected.includes(option) && s.checkboxSelected
                    ]}>
                      {category.selected.includes(option) && (
                        <AppText style={s.checkmark}>✓</AppText>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={s.modalFooter}>
          <TouchableOpacity onPress={handleClearFilters} style={s.clearButton}>
            <AppText variant="button" weight="700" style={s.clearButtonText}>
              Clear All
            </AppText>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleApplyFilters} style={s.applyButton}>
            <AppText variant="button" weight="700" style={s.applyButtonText}>
              Apply Filters
            </AppText>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (loading) {
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
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <AppText variant="body" weight="400" style={s.loadingText}>
            Loading parks...
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

      {/* Search Bar */}
      <View style={s.searchContainer}>
        <View style={s.searchInputContainer}>
          <TextInput
            style={s.searchInput}
            placeholder="Search parks by name, activity, amenity, or region..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearchButton} // Allow search on enter
          />
          <TouchableOpacity 
            style={s.searchButton}
            onPress={handleSearchButton}
          >
            <AppText style={s.searchButtonText}>Search</AppText>
          </TouchableOpacity>
        </View>
        
        {/* Filter Button Below Search */}
        <View style={s.filterButtonContainer}>
          <TouchableOpacity 
            style={s.filterButton}
            onPress={() => setShowFilters(true)}
          >
            <AppText style={s.filterButtonText}>Filter Parks</AppText>
          </TouchableOpacity>
        </View>
      </View>

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
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <AppText variant="body" weight="400" style={s.emptyText}>
              {searchQuery || filters.some(cat => cat.selected.length > 0) 
                ? "No parks match your search criteria" 
                : "No parks found in database"
              }
            </AppText>
            <TouchableOpacity style={s.retryButton} onPress={fetchParks}>
              <AppText variant="button" weight="700" style={s.retryButtonText}>
                Try Again
              </AppText>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Tab Buttons at Bottom Only */}
      {totalTabs > 1 && renderTabButtons()}

      {/* Filter Modal */}
      {showFilters && <FilterModal />}

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

  // Search Bar
  searchContainer: {
    padding: 16,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderColor: "#E9ECEF",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: "#FFF",
  },
  searchButton: {
    backgroundColor: "#28A745",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 80,
    alignItems: "center",
  },
  searchButtonText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 16,
  },
  filterButtonContainer: {
    alignItems: "flex-start",
  },
  filterButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 120,
    alignItems: "center",
  },
  filterButtonText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 16,
  },

  // Filter Modal
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    margin: 20,
    maxHeight: "80%",
    width: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
  },
  modalTitle: {
    fontSize: 20,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F8F9FA",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 20,
    color: "#6C757D",
  },
  filterContent: {
    maxHeight: 400,
    padding: 20,
  },
  filterCategory: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 18,
    marginBottom: 12,
    color: "#2C3E50",
  },
  optionsContainer: {
    gap: 8,
  },
  optionButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#F8F9FA",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E9ECEF",
  },
  optionButtonSelected: {
    backgroundColor: "#E7F3FF",
    borderColor: "#007AFF",
  },
  optionText: {
    flex: 1,
    fontSize: 16,
  },
  optionTextSelected: {
    color: "#007AFF",
    fontWeight: "600",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#6C757D",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  checkmark: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  modalFooter: {
    flexDirection: "row",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#E9ECEF",
    gap: 12,
  },
  clearButton: {
    flex: 1,
    backgroundColor: "#6C757D",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  clearButtonText: {
    color: "#FFF",
  },
  applyButton: {
    flex: 1,
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  applyButtonText: {
    color: "#FFF",
  },

  // Tab System (Bottom Only)
  tabContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#E9ECEF",
  },
  navButtons: {
    flexDirection: "row",
    gap: 8,
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F8F9FA",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E9ECEF",
  },
  navButtonDisabled: {
    backgroundColor: "#F8F9FA",
    borderColor: "#E9ECEF",
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 16,
  },
  navButtonTextDisabled: {
    opacity: 0.5,
  },
  pageNumbers: {
    flexDirection: "row",
    gap: 8,
  },
  tabButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F8F9FA",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E9ECEF",
  },
  activeTabButton: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  tabButtonText: {
    color: "#6C757D",
    fontSize: 12,
  },
  activeTabButtonText: {
    color: "#FFF",
  },

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
  hoursText: {
    color: "#495057",
  },
  regionContainer: {
    marginBottom: 12,
  },
  regionLabel: {
    color: "#6C757D",
    marginBottom: 2,
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
    paddingVertical: 10,
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
});