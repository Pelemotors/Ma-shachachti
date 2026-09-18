import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../auth/AuthContext";
import { getMobileApiBaseUrl } from "../utils/env";

/**
 * Foundation-only gate screen — not product Home/Tasks/Chat.
 * Native Google/Apple buttons call /api/auth/native via the auth layer;
 * until native SDKs are wired they surface a clear unavailable message.
 */
export function FoundationGateScreen() {
  const auth = useAuth();
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);

  async function run(provider: "google" | "apple") {
    setBusy(provider);
    try {
      await auth.signIn(provider);
    } catch {
      /* error shown via auth.error */
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.brand}>מה שכחתי?</Text>
      <Text style={styles.subtitle}>Mobile Foundation</Text>
      <Text style={styles.meta}>API: {getMobileApiBaseUrl()}</Text>
      <Text style={styles.meta}>Package: com.mashachachti.app</Text>

      {auth.error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {auth.error}
        </Text>
      ) : null}

      <Pressable
        style={styles.button}
        disabled={busy !== null}
        onPress={() => void run("google")}
      >
        {busy === "google" ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>המשך עם Google</Text>
        )}
      </Pressable>

      <Pressable
        style={[styles.button, styles.secondary]}
        disabled={busy !== null}
        onPress={() => void run("apple")}
      >
        {busy === "apple" ? (
          <ActivityIndicator color="#5C4033" />
        ) : (
          <Text style={[styles.buttonText, styles.secondaryText]}>
            המשך עם Apple
          </Text>
        )}
      </Pressable>

      <Text style={styles.hint}>
        אין WebView. Auth עובר דרך src/api → /api/auth/native → Secure Storage.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "#F7F1EA",
    gap: 12,
  },
  brand: {
    fontSize: 32,
    fontWeight: "700",
    color: "#3D2B1F",
    textAlign: "right",
  },
  subtitle: { fontSize: 16, color: "#6B5344", textAlign: "right" },
  meta: { fontSize: 12, color: "#8A7464", textAlign: "right" },
  error: {
    color: "#9B2C2C",
    backgroundColor: "#FDE8E8",
    padding: 12,
    borderRadius: 10,
    textAlign: "right",
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#8B5E3C",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  secondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D4C4B5",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryText: { color: "#5C4033" },
  hint: { marginTop: 16, fontSize: 12, color: "#8A7464", textAlign: "right" },
});
