import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../auth/AuthContext";
import { BootstrapScreen } from "../screens/BootstrapScreen";
import { FoundationGateScreen } from "../screens/FoundationGateScreen";
import { FoundationHomeScreen } from "../screens/FoundationHomeScreen";

export type RootStackParamList = {
  Gate: undefined;
  Foundation: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const auth = useAuth();

  if (!auth.ready) {
    return <BootstrapScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {auth.user ? (
          <Stack.Screen name="Foundation" component={FoundationHomeScreen} />
        ) : (
          <Stack.Screen name="Gate" component={FoundationGateScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
