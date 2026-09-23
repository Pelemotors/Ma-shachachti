import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getProfile, updateProfile, uploadAvatar } from "../../api/profile";
import { UserAvatar } from "../../components/UserAvatar";
import { useAuth } from "../../auth/AuthContext";
import { heebo } from "../home-v4/homeV4Theme";
import { S } from "./settingsTheme";

export function ProfileSettingsScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const email = user?.email ?? "";
  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  useEffect(() => {
    void getProfile()
      .then((data) => {
        const n = data.profile.display_name ?? "";
        setName(n);
        setSavedName(n);
        setAvatarUrl(data.profile.avatar_url ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "שגיאה"));
  }, []);

  const dirty = useMemo(
    () => name.trim() !== savedName.trim() && name.trim().length > 0,
    [name, savedName],
  );

  async function save() {
    if (!dirty || busy) return;
    setBusy(true);
    setError("");
    setSavedFlash(false);
    try {
      const data = await updateProfile({ display_name: name.trim() });
      setSavedName(data.profile.display_name ?? name.trim());
      setSavedFlash(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function pickAvatar() {
    setError("");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("נדרשת הרשאת גלריה כדי לבחור תמונה.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setAvatarBusy(true);
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 512, height: 512 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!manipulated.base64) throw new Error("לא הצלחנו לעבד את התמונה.");
      const data = await uploadAvatar({
        base64: manipulated.base64,
        contentType: "image/jpeg",
      });
      setAvatarUrl(data.profile.avatar_url ?? null);
      setSavedFlash(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "העלאת תמונה נכשלה");
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityLabel="חזרה" style={styles.backHit}>
          <Ionicons name="chevron-forward" size={22} color={S.darkBrown} />
        </Pressable>
        <Text style={styles.title}>הפרופיל שלי</Text>
        <View style={styles.backHit} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarBlock}>
          <Pressable
            onPress={() => void pickAvatar()}
            accessibilityLabel="החלפת תמונת פרופיל"
            style={styles.avatarHit}
          >
            <UserAvatar uri={avatarUrl} size="profile" />
            <View style={styles.cam}>
              {avatarBusy ? (
                <ActivityIndicator color={S.camel} />
              ) : (
                <Ionicons name="camera" size={18} color={S.darkBrown} />
              )}
            </View>
          </Pressable>
          <Pressable style={styles.outline} onPress={() => void pickAvatar()}>
            <Text style={styles.outlineText}>החלפת תמונת פרופיל</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>שם מלא</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={styles.input}
          placeholder="השם שלך"
          placeholderTextColor={S.muted}
          textAlign="right"
          maxLength={80}
        />

        <Text style={styles.label}>כתובת אימייל</Text>
        <View style={[styles.input, styles.readOnly]}>
          <Text style={styles.readOnlyText}>{email || "—"}</Text>
        </View>
        <Text style={styles.hint}>האימייל מנוהל דרך ההתחברות ואינו ניתן לשינוי כאן.</Text>

        <Pressable
          style={[styles.save, (!dirty || busy) && styles.saveDisabled]}
          disabled={!dirty || busy}
          onPress={() => void save()}
        >
          <Text style={styles.saveText}>{busy ? "שומר…" : "שמירת פרטים"}</Text>
        </Pressable>
        {savedFlash ? <Text style={styles.ok}>נשמר.</Text> : null}
        {error ? <Text style={styles.err}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: S.page },
  header: {
    height: 72,
    paddingHorizontal: S.padX,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: heebo("700"), fontSize: 26, color: S.text },
  scroll: { paddingHorizontal: S.padX, paddingBottom: 40 },
  avatarBlock: { alignItems: "center", marginBottom: 24, marginTop: 8 },
  avatarHit: { width: 112, height: 112 },
  cam: {
    position: "absolute",
    end: 4,
    bottom: 4,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  outline: {
    marginTop: 14,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: S.beige2,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineText: { fontFamily: heebo("600"), fontSize: 14, color: S.darkBrown },
  label: {
    fontFamily: heebo("600"),
    fontSize: 13,
    color: S.muted,
    textAlign: "right",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    height: 52,
    borderRadius: S.radiusInput,
    backgroundColor: S.surface,
    paddingHorizontal: 14,
    fontFamily: heebo("400"),
    fontSize: 16,
    color: S.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: S.divider,
  },
  readOnly: { justifyContent: "center" },
  readOnlyText: { fontFamily: heebo("400"), fontSize: 16, color: S.muted, textAlign: "right" },
  hint: {
    fontFamily: heebo("400"),
    fontSize: 12,
    color: S.muted,
    textAlign: "right",
    marginTop: 6,
  },
  save: {
    marginTop: 24,
    height: 54,
    borderRadius: 14,
    backgroundColor: S.camel,
    alignItems: "center",
    justifyContent: "center",
  },
  saveDisabled: { opacity: 0.45 },
  saveText: { fontFamily: heebo("700"), fontSize: 16, color: "#FFFFFF" },
  ok: { marginTop: 10, fontFamily: heebo("600"), color: S.darkBrown, textAlign: "center" },
  err: { marginTop: 10, fontFamily: heebo("400"), color: S.logout, textAlign: "center" },
});
