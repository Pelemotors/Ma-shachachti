import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { nativeOAuthHint } from "../auth/nativeIdentity";
import { requestPasswordReset } from "../auth/session";
import { heebo } from "./home-v4/homeV4Theme";

const HERO = require("../../assets/auth/login-hero-warm-entry.jpg");

const C = {
  page: "#FBF6EE",
  surface: "#FFFDFC",
  text: "#3B2418",
  support: "#4F4037",
  secondary: "#806E63",
  terracotta: "#BC6E45",
  terracottaPressed: "#A85F3B",
  warmBrown: "#72503B",
  inputBorder: "#E8DDD3",
  divider: "#D8C8BA",
  error: "#B85C52",
  white: "#FFFFFF",
} as const;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function FoundationGateScreen() {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get("window");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<"email" | "google" | "reset" | null>(null);
  const [localError, setLocalError] = useState("");
  const [info, setInfo] = useState("");
  const [primaryPressed, setPrimaryPressed] = useState(false);

  const heroH = useMemo(() => {
    if (height < 700) return Math.max(210, Math.min(225, height * 0.28));
    if (width >= 430) return 260;
    return 245;
  }, [height, width]);

  const titleSize = width < 370 ? 38 : width > 430 ? 44 : 42;
  const emailOk = isValidEmail(email);
  const canSubmit = emailOk && password.length > 0 && !busy;
  const error = localError || auth.error || "";
  const locked = Boolean(busy);

  async function emailSignIn() {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setLocalError("");
    setInfo("");
    auth.clearError();
    setBusy("email");
    try {
      await auth.signInWithEmail(email.trim(), password);
    } catch {
      /* error shown via auth.error */
    } finally {
      setBusy(null);
    }
  }

  async function googleSignIn() {
    if (busy) return;
    Keyboard.dismiss();
    setLocalError("");
    setInfo("");
    auth.clearError();
    setBusy("google");
    try {
      await auth.signIn("google");
    } catch {
      /* error shown via auth.error */
    } finally {
      setBusy(null);
    }
  }

  async function forgotPassword() {
    if (busy) return;
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setLocalError("כתובת המייל אינה תקינה.");
      return;
    }
    setLocalError("");
    auth.clearError();
    setBusy("reset");
    try {
      await requestPasswordReset(trimmed);
      setInfo("אם קיים חשבון עם הכתובת הזו, נשלח אליו קישור לאיפוס סיסמה.");
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "שליחת האיפוס נכשלה.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          onScrollBeginDrag={Keyboard.dismiss}
        >
          <Image
            source={HERO}
            style={{ width: "100%", height: heroH }}
            resizeMode="cover"
            accessible={false}
            importantForAccessibility="no"
          />
          <View style={styles.body}>
            <Text style={[styles.title, { fontSize: titleSize, lineHeight: titleSize + 8 }]}>
              מה שכחתי?
            </Text>
            <View style={styles.underline} />
            <Text style={styles.subtitle}>הבית שלך, היום שלך</Text>
            <Text style={styles.support}>זוכרים יחד את מה שחשוב באמת.</Text>

            <View style={styles.field}>
              <Ionicons name="mail-outline" size={20} color={C.secondary} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="כתובת אימייל"
                placeholderTextColor={C.secondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                textAlign="right"
                style={styles.input}
              />
            </View>
            <View style={styles.field}>
              <Ionicons name="lock-closed-outline" size={20} color={C.secondary} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="סיסמה"
                placeholderTextColor={C.secondary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                textAlign="right"
                style={styles.input}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                accessibilityLabel={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
                style={styles.iconHit}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={C.secondary}
                />
              </Pressable>
            </View>

            <Pressable
              onPress={() => void forgotPassword()}
              disabled={locked}
              accessibilityLabel="שכחת סיסמה?"
              style={styles.forgotHit}
            >
              <Text style={styles.forgot}>שכחת סיסמה?</Text>
            </Pressable>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {info ? <Text style={styles.info}>{info}</Text> : null}

            <Pressable
              onPress={() => void emailSignIn()}
              disabled={!canSubmit}
              onPressIn={() => setPrimaryPressed(true)}
              onPressOut={() => setPrimaryPressed(false)}
              accessibilityLabel="התחבר"
              style={[
                styles.primary,
                { backgroundColor: primaryPressed ? C.terracottaPressed : C.terracotta },
                !canSubmit && styles.disabled,
              ]}
            >
              {busy === "email" ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <Text style={styles.primaryText}>התחבר</Text>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>או</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              onPress={() => void googleSignIn()}
              disabled={locked}
              accessibilityLabel="התחבר עם Google"
              accessibilityHint={nativeOAuthHint("google")}
              style={[styles.google, locked && styles.disabled]}
            >
              {busy === "google" ? (
                <ActivityIndicator color={C.terracotta} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color="#4285F4" />
                  <Text style={styles.googleText}>התחבר עם Google</Text>
                </>
              )}
            </Pressable>

            <View style={styles.trust}>
              <Ionicons name="leaf-outline" size={14} color={C.secondary} />
              <Text style={styles.trustText}>המידע שלך נשאר אצלך</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.page },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 24 },
  body: { paddingHorizontal: 20, paddingTop: 18 },
  title: {
    fontFamily: heebo("800"),
    color: C.text,
    textAlign: "center",
    writingDirection: "rtl",
  },
  underline: {
    width: 108,
    height: 4,
    borderRadius: 99,
    backgroundColor: C.terracotta,
    alignSelf: "center",
    marginTop: 10,
  },
  subtitle: {
    marginTop: 14,
    fontFamily: heebo("500"),
    fontSize: 25,
    lineHeight: 34,
    color: C.terracotta,
    textAlign: "center",
    writingDirection: "rtl",
  },
  support: {
    marginTop: 6,
    marginBottom: 20,
    fontFamily: heebo("400"),
    fontSize: 17,
    lineHeight: 25,
    color: C.support,
    textAlign: "center",
    writingDirection: "rtl",
  },
  field: {
    height: 58,
    borderRadius: 18,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.inputBorder,
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  input: {
    flex: 1,
    fontFamily: heebo("400"),
    fontSize: 16,
    color: C.text,
    writingDirection: "rtl",
  },
  iconHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  forgotHit: {
    minHeight: 44,
    alignSelf: "flex-end",
    justifyContent: "center",
  },
  forgot: {
    fontFamily: heebo("400"),
    fontSize: 14,
    color: C.warmBrown,
    textDecorationLine: "underline",
    textAlign: "right",
  },
  error: {
    marginBottom: 10,
    fontFamily: heebo("500"),
    fontSize: 14,
    color: C.error,
    textAlign: "right",
    writingDirection: "rtl",
  },
  info: {
    marginBottom: 10,
    fontFamily: heebo("400"),
    fontSize: 14,
    color: C.warmBrown,
    textAlign: "right",
    writingDirection: "rtl",
  },
  primary: {
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    fontFamily: heebo("700"),
    fontSize: 20,
    color: C.white,
  },
  disabled: { opacity: 0.45 },
  dividerRow: {
    marginVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.divider },
  dividerText: { fontFamily: heebo("400"), fontSize: 14, color: C.secondary },
  google: {
    height: 58,
    borderRadius: 18,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.inputBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleText: {
    fontFamily: heebo("600"),
    fontSize: 17,
    color: C.text,
  },
  trust: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  trustText: {
    fontFamily: heebo("400"),
    fontSize: 13,
    color: C.secondary,
  },
});
