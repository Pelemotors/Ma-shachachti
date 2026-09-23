import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Heebo_400Regular,
  Heebo_500Medium,
  Heebo_600SemiBold,
  Heebo_700Bold,
  Heebo_800ExtraBold,
} from "@expo-google-fonts/heebo";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../auth/AuthContext";
import { setNativeIdentityProvider } from "../auth/nativeIdentity";
import { RootNavigator } from "../navigation/RootNavigator";
import { syncProductClock } from "../product/productClock";

if (Platform.OS === "android") {
  const { googleNativeIdentityProvider } = require("../auth/googleIdentity") as typeof import("../auth/googleIdentity");
  setNativeIdentityProvider(googleNativeIdentityProvider);
}

void SplashScreen.preventAutoHideAsync();

export function AppRoot() {
  const [fontsLoaded, fontError] = useFonts({
    Heebo_400Regular,
    Heebo_500Medium,
    Heebo_600SemiBold,
    Heebo_700Bold,
    Heebo_800ExtraBold,
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void syncProductClock();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncProductClock();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    void SplashScreen.hideAsync().finally(() => setReady(true));
  }, [fontsLoaded, fontError]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
