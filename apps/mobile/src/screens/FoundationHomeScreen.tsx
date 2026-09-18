import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { getMobileApiBaseUrl } from "../utils/env";
import { PrivacySettingsScreen } from "./PrivacySettingsScreen";

/** Signed-in foundation placeholder — product screens come later. */
export function FoundationHomeScreen() {
  const auth = useAuth();
  const [privacy, setPrivacy] = useState(false);

  if (privacy) {
    return <PrivacySettingsScreen onBack={() => setPrivacy(false)} />;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Foundation מוכן</Text>
      <Text style={styles.line}>משתמש: {auth.user?.email ?? auth.user?.id}</Text>
      <Text style={styles.line}>API: {getMobileApiBaseUrl()}</Text>
      <Text style={styles.note}>
        אין מסכי Tasks / Home / Chat / Voice / Widgets בשלב זה.
      </Text>
      <Pressable style={styles.button} onPress={() => setPrivacy(true)}>
        <Text style={styles.buttonText}>פרטיות וחשבון</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={() => void auth.signOut()}>
        <Text style={styles.secondaryText}>יציאה</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "#F7F1EA",
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#3D2B1F",
    textAlign: "right",
  },
  line: { fontSize: 14, color: "#5C4033", textAlign: "right" },
  note: { fontSize: 13, color: "#8A7464", textAlign: "right", marginTop: 8 },
  button: {
    marginTop: 20,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#8B5E3C",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondary: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: "#8B5E3C", fontSize: 15 },
});
