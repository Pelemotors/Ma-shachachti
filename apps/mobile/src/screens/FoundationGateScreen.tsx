import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { nativeOAuthHint } from "../auth/nativeIdentity";
import {
  AppScreen,
  PrimaryActionButton,
  SecondaryPillButton,
} from "../components/ui";
import { Field } from "../ui/chrome";
import { colors, rtlText, space, type } from "../theme";

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
    <AppScreen>
      <View style={styles.wrap}>
        <Text style={styles.brand}>מה שכחתי?</Text>
        <Text style={styles.subtitle}>התחברות</Text>
        {auth.error ? <Text style={styles.error}>{auth.error}</Text> : null}
        <Field value={email} onChangeText={setEmail} placeholder="אימייל" />
        <Field
          value={password}
          onChangeText={setPassword}
          placeholder="סיסמה"
          secure
        />
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <PrimaryActionButton label="כניסה" onPress={() => void emailSignIn()} />
        )}
        <PrimaryActionButton label="המשך עם Google" onPress={() => undefined} disabled />
        <Text style={styles.hint}>{nativeOAuthHint("google")}</Text>
        <SecondaryPillButton label="המשך עם Apple" onPress={() => undefined} />
        <Text style={styles.hint}>{nativeOAuthHint("apple")}</Text>
        <PrimaryActionButton label="המשך לצפייה" onPress={auth.enterPreview} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", gap: space.md, paddingTop: 40 },
  brand: { ...type.greeting, ...rtlText },
  subtitle: { ...type.section, ...rtlText, color: colors.textMuted },
  error: {
    ...rtlText,
    color: colors.accentDeep,
    backgroundColor: colors.dangerSoft,
    padding: 12,
    borderRadius: 16,
  },
  hint: { ...type.caption, ...rtlText },
});
