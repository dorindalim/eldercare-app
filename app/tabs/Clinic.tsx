import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import TopBar, { type LangCode } from "../../src/components/TopBar";

const datasetId = "d_9d0bbe366aee923a6e202f80bb356bb9";
const url = "https://data.gov.sg/api/action/datastore_search?resource_id=" + datasetId;

export default function ClinicScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { logout } = useAuth();
  const [clinics, setClinics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setLang = (code: LangCode) => {
    i18n.changeLanguage(code);
    AsyncStorage.setItem("lang", code).catch(() => {});
  };

  const fetchClinics = () => {
    setLoading(true);
    setError(null);
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch data");
        }
        return response.json();
      })
      .then((data) => {
        const records = data.result?.records || [];
        const sortedClinics = records.sort((a: any, b: any) => (a.minutes || 0) - (b.minutes || 0));
        setClinics(sortedClinics);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching data:", error);
        setError("Failed to load clinic data.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchClinics();
  }, []);

  const handleGetDirections = (hospital: string) => {
    router.push({
      pathname: "/tabs/Navigation",
      params: { 
        presetQuery: hospital
      }
    });
  };

  const renderClinicItem = ({ item }: { item: any }) => (
    <View style={s.clinicItem}>
      <AppText variant="title" weight="700" style={s.clinicName}>
        {item.hospital}
      </AppText>
      <AppText variant="body" weight="400" style={s.waitingTime}>
        {item.minutes} minutes
      </AppText>
      <TouchableOpacity style={[s.directionButton, {marginTop: 12}]} onPress={() => handleGetDirections(item.hospital)}>
        <AppText variant="button" weight="700" style={s.directionButtonText}>
          Get Directions
        </AppText>
      </TouchableOpacity>
    </View>
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
          title={t("clinic.title")}
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
          title={t("clinic.title")}
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
        title={t("clinic.title")}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/LogIn");
        }}
      />

      <View style={s.header}>
        <AppText variant="h1" weight="800" style={s.title}>
          Clinic Recommendations
        </AppText>
        <AppText variant="body" weight="400" style={s.subtitle}>
          Clinics sorted by the shortest waiting time.
        </AppText>
      </View>

      <FlatList
        data={clinics}
        renderItem={renderClinicItem}
        keyExtractor={(item) => (item._id ? item._id.toString() : Math.random().toString())}
        contentContainerStyle={s.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { 
    flex: 1, 
    backgroundColor: "#F8F9FA" 
  },
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
    flexDirection: "column",
    alignItems: "flex-start",
  },
  clinicName: {
    marginBottom: 8,
  },
  waitingTime: {
    color: "#28A745",
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
});

