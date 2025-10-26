// app.config.ts
import "dotenv/config";
import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "eldercare-app",
  slug: "eldercare-app",

  notification: {
    color: "#007AFF",
  },

  android: {
    package: "com.dorindalim.eldercareapp",
    softwareKeyboardLayoutMode: "resize",
    adaptiveIcon: { backgroundColor: "#ffffff" },
    config: {
      googleMaps: { apiKey: process.env.ANDROID_GOOGLE_MAPS_KEY },
    },
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "POST_NOTIFICATIONS",
    ],
    edgeToEdgeEnabled: true,
  },

  ios: {
    bundleIdentifier: "com.dorindalim.eldercareapp",
    supportsTablet: true,
    config: { googleMapsApiKey: process.env.IOS_GOOGLE_MAPS_KEY },
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "We use your location to provide navigation and directions.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "We use your location to provide navigation and directions.",
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  extra: {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    GOOGLE_PLACES_KEY: process.env.GOOGLE_PLACES_KEY,
    eas: { projectId: "cec36b27-3167-4160-8471-986df452d97e" },
  },
});
