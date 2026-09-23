import { Ionicons } from "@expo/vector-icons";
import { BackHandler, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { apiRequest } from "../api/client";
import { clearSecureSession } from "../storage/secureSession";
import { useEffect, useState } from "react";
import { heebo } from "./home-v4/homeV4Theme";
import { S } from "./settings/settingsTheme";

const PRIVACY_URL = "https://mashachachti.co.il/privacy";
const DELETION_URL = "https://mashachachti.co.il/account-deletion";

/** Privacy & account — only real destinations, no decorative controls. */
export function PrivacySettingsScreen({
  onBack,
}: {
  onBack: () => void;
  onOpenCalendar?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  async function deleteAccount() {
    setError("");
    setBusy(true);
    try {
      await apiRequest("/api/account/delete", {
        method: "POST",
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      await clearSecureSession();
      await auth.signOut();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "מחיקה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  const rows = [
    {
      icon: "document-text-outline" as const,
      title: "הנתונים שלך",
      subtitle: "מדיניות פרטיות",
      onPress: () => void Linking.openURL(PRIVACY_URL),
    },
    {
      icon: "trash-outline" as const,
      title: "מחיקת נתונים",
      subtitle: "בקשת מחיקת חשבון בדפדפן",
      onPress: () => void Linking.openURL(DELETION_URL),
    },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backHit} accessibilityLabel="חזרה">
          <Ionicons name="chevron-forward" size={22} color={S.darkBrown} />
        </Pressable>
        <Text style={styles.title}>פרטיות ואבטחה</Text>
        <View style={styles.backHit} />
      </View>

      <View style={styles.card}>
        {rows.map((row, i) => (
          <Pressable
            key={row.title}
            style={[styles.row, i < rows.length - 1 && styles.border]}
            onPress={row.onPress}
          >
            <View style={styles.iconCircle}>
              <Ionicons name={row.icon} size={20} color={S.darkBrown} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.rowSub}>{row.subtitle}</Text>
            </View>
            <Ionicons name="chevron-back" size={18} color={S.muted} />
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.danger, (busy || done) && { opacity: 0.5 }]}
        disabled={busy || done}
        onPress={() => void deleteAccount()}
      >
        <Text style={styles.dangerText}>
          {done ? "החשבון נמחק" : busy ? "מוחקים…" : "מחיקת החשבון שלי"}
        </Text>
      </Pressable>
      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: S.page, paddingHorizontal: S.padX },
  header: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: heebo("700"), fontSize: 26, color: S.text },
  card: {
    borderRadius: S.radiusCard,
    backgroundColor: S.surface,
    overflow: "hidden",
    marginBottom: 16,
  },
  row: {
    minHeight: 68,
    paddingHorizontal: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: S.divider },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: S.beige,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontFamily: heebo("600"), fontSize: 16, color: S.text, textAlign: "right" },
  rowSub: { fontFamily: heebo("400"), fontSize: 13, color: S.muted, textAlign: "right" },
  danger: {
    height: 56,
    borderRadius: 14,
    backgroundColor: S.logoutBg,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerText: { fontFamily: heebo("700"), fontSize: 16, color: S.logout },
  err: { marginTop: 12, color: S.logout, textAlign: "center", fontFamily: heebo("400") },
});
