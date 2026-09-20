import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../auth/AuthContext";
import { nativeOAuthHint } from "../auth/nativeIdentity";
import { Field } from "../ui/chrome";

/**
 * Working path is email/password. Google/Apple stay visibly disabled until
 * credentials are planted (HUMAN RELEASE CHECK / Gate B).
 */
export function FoundationGateScreen() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function emailSignIn() {
    setBusy(true);
    try {
      await auth.signInWithEmail(email, password);
    } catch {
      /* error shown via auth.error */
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.brand}>מה שכחתי?</Text>
      <Text style={styles.subtitle}>התחברות</Text>

      {auth.error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {auth.error}
        </Text>
      ) : null}

      <Field value={email} onChangeText={setEmail} placeholder="אימייל" />
      <Field
        value={password}
        onChangeText={setPassword}
        placeholder="סיסמה"
        secure
      />
      <Pressable
        style={styles.button}
        disabled={busy}
        onPress={() => void emailSignIn()}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>כניסה</Text>
        )}
      </Pressable>

      <Pressable style={[styles.button, styles.disabled]} disabled>
        <Text style={styles.buttonText}>המשך עם Google</Text>
      </Pressable>
      <Text style={styles.hint}>{nativeOAuthHint("google")}</Text>

      <Pressable style={[styles.button, styles.secondary, styles.disabled]} disabled>
        <Text style={[styles.buttonText, styles.secondaryText]}>המשך עם Apple</Text>
      </Pressable>
      <Text style={styles.hint}>{nativeOAuthHint("apple")}</Text>
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
  disabled: { opacity: 0.45 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryText: { color: "#5C4033" },
  hint: { fontSize: 12, color: "#8A7464", textAlign: "right" },
});
