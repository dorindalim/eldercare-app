import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, FlatList, Linking, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import TopBar, { type LangCode } from "../../src/components/TopBar";
import { supabase } from "../../src/lib/supabase";

type ParkLocation = {
  id: string;
  title: string;
  url: string;
  scraped_at: string;
};

export default function WalkingScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { i18n } = useTranslation();
  
  const setLang = async (code: string) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  const [parks, setParks] = useState<ParkLocation[]>([]);
  const [selectedPark, setSelectedPark] = useState<ParkLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch parks from Supabase
  const fetchParks = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('parks') // Your parks table
        .select('*')
        .order('title', { ascending: true }); // Order by title

      if (error) {
        throw error;
      }

      if (data) {
        // Transform Supabase data to match our ParkLocation type
        const transformedData: ParkLocation[] = data.map(item => ({
          id: item.id?.toString() || Math.random().toString(),
          title: item.title || 'Untitled Park',
          url: item.url || '',
          scraped_at: item.scraped_at || new Date().toISOString()
        }));
        setParks(transformedData);
      }
    } catch (err) {
      console.error('Error fetching parks:', err);
      setError('Failed to load parks');
      Alert.alert('Error', 'Failed to load parks from database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParks();
  }, []);

  const handleParkSelect = (park: ParkLocation) => {
    setSelectedPark(park);
    
    // Use the title as the search query for navigation
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

  const formatScrapedDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-SG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'Unknown date';
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
      <AppText variant="title" weight="700" style={s.parkTitle}>
        {item.title}
      </AppText>
      
      {/* URL - Make it clickable */}
      {item.url && (
        <TouchableOpacity 
          onPress={() => handleUrlPress(item.url)}
          style={s.urlContainer}
        >
          <AppText variant="caption" weight="600" style={s.urlText} numberOfLines={1}>
            🔗 {item.url}
          </AppText>
        </TouchableOpacity>
      )}
      
      {/* Scraped Date */}
      <AppText variant="caption" weight="400" style={s.scrapedDate}>
        📅 Added: {formatScrapedDate(item.scraped_at)}
      </AppText>
      
      <View style={s.directionButton}>
        <AppText variant="button" weight="700" style={s.directionButtonText}>
          Get Directions
        </AppText>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <TopBar
          language={i18n.language as LangCode}
          setLanguage={setLang as (c: LangCode) => void}
          title="Singapore Parks"
          showHeart={false}
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
          title="Singapore Parks"
          showHeart={false}
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
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      {/* Top Bar */}
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={setLang as (c: LangCode) => void}
        title="Singapore Parks"
        showHeart={false}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/LogIn");
        }}
      />

      {/* Header */}
      <View style={s.header}>
        <AppText variant="h1" weight="800" style={s.title}>
          Singapore Parks
        </AppText>
        <AppText variant="body" weight="400" style={s.subtitle}>
          Browse parks in Singapore. Tap any park to get directions or tap the URL to learn more.
        </AppText>
        
        <View style={s.statsContainer}>
          <AppText variant="caption" weight="600" style={s.statsText}>
            {parks.length} parks available
          </AppText>
          <TouchableOpacity style={s.refreshButton} onPress={fetchParks}>
            <AppText variant="caption" weight="700" style={s.refreshButtonText}>
              Refresh
            </AppText>
          </TouchableOpacity>
        </View>
      </View>

      {/* Parks List */}
      <FlatList
        data={parks}
        renderItem={renderParkItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContainer}
        showsVerticalScrollIndicator={false}
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

      {/* Selected Park Info */}
      {selectedPark && (
        <View style={s.selectedInfo}>
          <AppText variant="caption" weight="600" style={s.selectedInfoText}>
            Opening directions to: <AppText variant="caption" weight="800" style={s.selectedInfoName}>
              {selectedPark.title}
            </AppText>
          </AppText>
        </View>
      )}
    </SafeAreaView>
  );
}

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
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statsText: {
    color: "#28A745",
  },
  refreshButton: {
    backgroundColor: "#28A745",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  refreshButtonText: {
    color: "#FFF",
  },

  // List
  listContainer: {
    padding: 16,
  },

  // Park Item
  parkItem: {
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
  selectedParkItem: {
    borderColor: "#007AFF",
    backgroundColor: "#F0F8FF",
  },
  parkTitle: {
    marginBottom: 8,
  },
  urlContainer: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: "#F8F9FA",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E9ECEF",
  },
  urlText: {
    color: "#007AFF",
  },
  scrapedDate: {
    marginBottom: 12,
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