import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { ProductHomeScreen } from "./ProductHomeScreen";
import { PrivacySettingsScreen } from "./PrivacySettingsScreen";
import { TasksScreen } from "./TasksScreen";
import { ChatScreen } from "./ChatScreen";
import { ListsScreen } from "./ListsScreen";
import { DayPlanScreen } from "./DayPlanScreen";
import { BankScreen } from "./BankScreen";
import { CalendarScreen } from "./CalendarScreen";
import { HouseholdScreen } from "./HouseholdScreen";
import { NotificationSettingsScreen } from "./NotificationSettingsScreen";

export function FoundationHomeScreen() {
  const auth = useAuth();
  const [screen, setScreen] = useState("home");

  if (screen === "privacy") {
    return <PrivacySettingsScreen onBack={() => setScreen("home")} />;
  }
  if (screen === "tasks") {
    return <TasksScreen onBack={() => setScreen("home")} />;
  }
  if (screen === "chat") {
    return <ChatScreen onBack={() => setScreen("home")} />;
  }
  if (screen === "lists") {
    return <ListsScreen onBack={() => setScreen("home")} />;
  }
  if (screen === "plan") {
    return <DayPlanScreen mode="plan" onBack={() => setScreen("home")} />;
  }
  if (screen === "freetime") {
    return <DayPlanScreen mode="freetime" onBack={() => setScreen("home")} />;
  }
  if (screen === "bank") {
    return <BankScreen onBack={() => setScreen("home")} />;
  }
  if (screen === "calendar") {
    return <CalendarScreen onBack={() => setScreen("home")} />;
  }
  if (screen === "household") {
    return <HouseholdScreen onBack={() => setScreen("home")} />;
  }
  if (screen === "notifications") {
    return <NotificationSettingsScreen onBack={() => setScreen("home")} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <ProductHomeScreen onOpen={setScreen} />
      <Pressable style={styles.signOut} onPress={() => void auth.signOut()}>
        <Text style={styles.back}>יציאה</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { textAlign: "center", color: "#8B5E3C", marginTop: 16 },
  signOut: { padding: 12, backgroundColor: "#F7F1EA" },
});
