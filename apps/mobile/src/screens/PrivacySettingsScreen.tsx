import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { apiRequest } from "../api/client";
import { clearSecureSession } from "../storage/secureSession";
import { useEffect, useState } from "react";
import { Field } from "../ui/chrome";

const PRIVACY_URL = "https://mashachachti.co.il/privacy";
const DELETION_URL = "https://mashachachti.co.il/account-deletion";

/** Privacy & account settings for Android foundation. */
export function PrivacySettingsScreen({
  onBack,
  onOpenCalendar,
}: {
  onBack: () => void;
  onOpenCalendar?: () => void;
}) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [phone, setPhone] = useState("");

  useEffect(() => {
    void apiRequest<{ profile?: { phone_e164?: string | null } }>("/api/profile")
      .then((data) => setPhone(data.profile?.phone_e164 ?? ""))
      .catch(() => undefined);
  }, []);

  async function savePhone() {
    setError("");
    setBusy(true);
    try {
      await apiRequest("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ phone_e164: phone.trim() || null }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת הטלפון נכשלה");
    } finally {
      setBusy(false);
    }
  }

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

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>פרטיות וחשבון</Text>

      <Field value={phone} onChangeText={setPhone} hint="טלפון אופציונלי" />
      <Pressable style={styles.row} disabled={busy} onPress={() => void savePhone()}>
        <Text style={styles.rowText}>שמירת טלפון</Text>
      </Pressable>

      {onOpenCalendar ? (
        <Pressable style={styles.row} onPress={onOpenCalendar}>
          <Text style={styles.rowText}>יומן Google</Text>
        </Pressable>
      ) : null}
      <Pressable
        style={styles.row}
        onPress={() => void Linking.openURL(PRIVACY_URL)}
      >
        <Text style={styles.rowText}>מדיניות פרטיות</Text>
      </Pressable>

      <Pressable
        style={styles.row}
        onPress={() => void Linking.openURL(DELETION_URL)}
      >
        <Text style={styles.rowText}>מחיקת חשבון (בדפדפן)</Text>
      </Pressable>

      <Pressable
        style={[styles.row, styles.danger]}
        disabled={busy || done}
        onPress={() => void deleteAccount()}
      >
        <Text style={styles.dangerText}>
          {done ? "החשבון נמחק" : busy ? "מוחקים…" : "מחיקת החשבון שלי"}
        </Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.back} onPress={onBack}>
        <Text style={styles.backText}>חזרה</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: 24,
    backgroundColor: "#F7F1EA",
    gap: 12,
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#3D2B1F",
    textAlign: "right",
    marginBottom: 8,
  },
  row: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  rowText: { fontSize: 16, color: "#3D2B1F", fontWeight: "600" },
  danger: { backgroundColor: "#F3E0D8" },
  dangerText: { fontSize: 16, color: "#8B2E1F", fontWeight: "700" },
  error: { color: "#8B2E1F", textAlign: "right" },
  back: { marginTop: 12, alignItems: "center" },
  backText: { color: "#8B5E3C", fontSize: 15 },
});
