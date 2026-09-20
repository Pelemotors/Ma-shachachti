import { useEffect } from "react";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../auth/AuthContext";
import { setNativeIdentityProvider } from "../auth/nativeIdentity";
import { RootNavigator } from "../navigation/RootNavigator";

if (Platform.OS === "android") {
  const { googleNativeIdentityProvider } = require("../auth/googleIdentity") as typeof import("../auth/googleIdentity");
  setNativeIdentityProvider(googleNativeIdentityProvider);
}

void SplashScreen.preventAutoHideAsync();

export function AppRoot() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
