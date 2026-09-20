import { ExpoConfig, ConfigContext } from "expo/config";

const APP_NAME = "מה שכחתי?";
const SLUG = "ma-shachachti";
const BUNDLE_ID = "com.mashachachti.app";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: SLUG,
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  scheme: "mashachachti",
  ios: {
    supportsTablet: true,
    bundleIdentifier: BUNDLE_ID,
    infoPlist: {
      CFBundleDisplayName: APP_NAME,
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
      backgroundColor: "#E6F4FE",
    },
    predictiveBackGestureEnabled: false,
    // Least permission for foundation — voice/push permissions added with features.
    blockedPermissions: [
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.CAMERA",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.READ_CONTACTS",
      "com.google.android.gms.permission.AD_ID",
    ],
    permissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.POST_NOTIFICATIONS",
    ],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: "https",
            host: "mashachachti.co.il",
            pathPrefix: "/app",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  plugins: [
    "expo-dev-client",
    "expo-secure-store",
    "expo-splash-screen",
    "expo-audio",
    "expo-asset",
    "expo-web-browser",
  ],
  extra: {
    mobileApiBaseUrl:
      process.env.MOBILE_API_BASE_URL ?? "https://mashachachti.co.il",
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
