import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react"; // Added useRef
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, FlatList, Image, Linking, RefreshControl, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import TopBar, { type LangCode } from "../../src/components/TopBar";
import { supabase } from "../../src/lib/supabase";

type ParkLocation = {
  id: string;
  title: string;
  image: string;
  url: string;
  hours: string;
};

export default function WalkingScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { t, i18n } = useTranslation();
  
  // Add FlatList ref
  const flatListRef = useRef<FlatList>(null);
  
  const setLang = async (code: string) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  const [parks, setParks] = useState<ParkLocation[]>([]);
  const [selectedPark, setSelectedPark] = useState<ParkLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Calculate tabs data
  const parksPerTab = 10;
  const totalTabs = Math.ceil(parks.length / parksPerTab);
  const currentParks = parks.slice(
    currentTab * parksPerTab,
    (currentTab + 1) * parksPerTab
  );

  // Calculate visible page range (max 3 pages at a time)
  const getVisiblePages = () => {
    if (totalTabs <= 3) {
      return Array.from({ length: totalTabs }, (_, i) => i);
    }

    if (currentTab === 0) {
      return [0, 1, 2]; // First page: show 1, 2, 3
    } else if (currentTab === totalTabs - 1) {
      return [totalTabs - 3, totalTabs - 2, totalTabs - 1]; // Last page: show last 3
    } else {
      return [currentTab - 1, currentTab, currentTab + 1]; // Middle: show previous, current, next
    }
  };

  const visiblePages = getVisiblePages();

  // Scroll to top function
  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({ animated: true, offset: 0 });
  };

  // Navigation handlers - updated to scroll to top
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

  // Updated tab change handler
  const handleTabChange = (tabIndex: number) => {
    setCurrentTab(tabIndex);
    scrollToTop();
  };

  // Fetch parks from Supabase
  const fetchParks = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('all_parks')
        .select('title, image, url, hours')
        .order('title', { ascending: true });

      if (error) {
        throw error;
      }

      if (data) {
        const transformedData: ParkLocation[] = data.map(item => ({
          id: item.title || Math.random().toString(),
          title: item.title || 'Untitled Park',
          image: item.image || '',
          url: item.url || '',
          hours: item.hours || 'Hours not available'
        }));
        setParks(transformedData);
      }
    } catch (err) {
      console.error('Error fetching parks:', err);
      setError('Failed to load parks');
      Alert.alert('Error', 'Failed to load parks from database');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Pull to refresh handler
  const onRefresh = () => {
    setRefreshing(true);
    fetchParks();
  };

  useEffect(() => {
    fetchParks();
  }, []);

  const handleParkSelect = (park: ParkLocation) => {
    setSelectedPark(park);
    
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
        selectedPark?.id === item.id && s.selectedParkItem
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
      
      <AppText variant="title" weight="700" style={s.parkTitle}>
        {item.title}
      </AppText>
      
      {/* Hours */}
      <View style={s.hoursContainer}>
        <AppText variant="caption" weight="600" style={s.hoursLabel}>
          🕒 Hours:
        </AppText>
        <AppText variant="caption" weight="400" style={s.hoursText}>
          {item.hours}
        </AppText>
      </View>
      
      {/* URL - Make it clickable */}
      {item.url && (
        <TouchableOpacity 
          onPress={() => handleUrlPress(item.url)}
          style={s.urlContainer}
        >
          <AppText variant="caption" weight="600" style={s.urlText} numberOfLines={1}>
            🔗 Learn More at NParks.gov.sg
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

  // ... rest of the component (loading, error, and main return) remains the same
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


      {/* Parks List with Pull to Refresh and ref */}
      <FlatList
        ref={flatListRef} // Added ref here
        data={currentParks}
        renderItem={renderParkItem}
        keyExtractor={(item) => item.id}
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
              No parks found in database
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

    </SafeAreaView>
  );
}

// Styles remain the same
const s = StyleSheet.create({
  safe: { 
    flex: 1, 
    backgroundColor: "#F8F9FA" 
  },

  // Header
  header: {
    padding: 20,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
  },
  title: {
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 12,
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
  parkTitle: {
    marginBottom: 12,
  },
  hoursContainer: {
    marginBottom: 12,
  },
  hoursLabel: {
    color: "#28A745",
    marginBottom: 4,
  },
  hoursText: {
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

  // Selected Location Info
  selectedInfo: {
    backgroundColor: "#E7F3FF",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#007AFF",
  },
  selectedInfoText: {
    color: "#0066CC",
    textAlign: "center",
  },
  selectedInfoName: {
    color: "#0066CC",
  },
});