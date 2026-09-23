import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getProfile } from "../../api/profile";
import { UserAvatar } from "../../components/UserAvatar";
import { useAuth } from "../../auth/AuthContext";
import { heebo } from "../home-v4/homeV4Theme";
import { S } from "./settingsTheme";

type RowId =
  | "notifications"
  | "calendar"
  | "household"
  | "privacy"
  | "help"
  | "about";

const ROWS: Array<{
  id: RowId;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}> = [
  {
    id: "notifications",
    icon: "notifications-outline",
    title: "התראות",
    subtitle: "ניהול התראות והרשאות",
  },
  {
    id: "calendar",
    icon: "calendar-outline",
    title: "לוח שנה",
    subtitle: "חיבור וניהול יומנים",
  },
  {
    id: "household",
    icon: "home-outline",
    title: "משק בית",
    subtitle: "ניהול האנשים והחברים בבית",
  },
  {
    id: "privacy",
    icon: "shield-checkmark-outline",
    title: "פרטיות ואבטחה",
    subtitle: "הנתונים שלך בידיים שלך",
  },
  {
    id: "help",
    icon: "help-circle-outline",
    title: "עזרה ותמיכה",
    subtitle: "שאלות נפוצות, יצירת קשר",
  },
  {
    id: "about",
    icon: "information-circle-outline",
    title: "אודות האפליקציה",
    subtitle: `גרסה ${Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "—"}`,
  },
];

export function SettingsHubScreen({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (screen: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { signOut, user } = useAuth();
  const [name, setName] = useState(user?.email?.split("@")[0] ?? "משתמשת");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const data = await getProfile();
        if (!alive) return;
        if (data.profile.display_name) setName(data.profile.display_name);
        if (data.profile.avatar_url) setAvatarUrl(data.profile.avatar_url);
      } catch {
        /* keep fallbacks */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function confirmLogout() {
    Alert.alert("לצאת מהחשבון?", undefined, [
      { text: "ביטול", style: "cancel" },
      {
        text: "יציאה",
        style: "destructive",
        onPress: () => {
          void signOut();
        },
      },
    ]);
  }

  function handleRow(id: RowId) {
    if (id === "about") {
      Alert.alert(
        "מה שכחתי?",
        `גרסה ${Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "—"}`,
      );
      return;
    }
    onOpen(id);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          accessibilityLabel="חזרה"
          hitSlop={12}
          style={styles.backHit}
        >
          <Ionicons name="chevron-forward" size={22} color={S.darkBrown} />
        </Pressable>
        <Text style={styles.title}>הגדרות</Text>
        <View style={styles.backHit} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={styles.profileCard}
          onPress={() => onOpen("profile")}
          accessibilityRole="button"
          accessibilityLabel="הצגה ועריכת פרופיל"
        >
          {loading ? (
            <ActivityIndicator color={S.camel} />
          ) : (
            <UserAvatar uri={avatarUrl} size="settings" />
          )}
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{name}</Text>
            <Text style={styles.profileSub}>הצגה ועריכת פרופיל</Text>
          </View>
          <Ionicons name="chevron-back" size={20} color={S.muted} />
        </Pressable>

        <View style={styles.card}>
          {ROWS.map((row, index) => (
            <Pressable
              key={row.id}
              style={[
                styles.row,
                index < ROWS.length - 1 ? styles.rowBorder : null,
              ]}
              onPress={() => handleRow(row.id)}
              accessibilityRole="button"
              accessibilityLabel={row.title}
            >
              <View style={styles.iconCircle}>
                <Ionicons name={row.icon} size={20} color={S.darkBrown} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <Text style={styles.rowSub}>{row.subtitle}</Text>
              </View>
              <Ionicons name="chevron-back" size={18} color={S.muted} />
            </Pressable>
          ))}
        </View>

        <Pressable
          style={styles.logout}
          onPress={confirmLogout}
          accessibilityRole="button"
          accessibilityLabel="יציאה מהחשבון"
        >
          <Ionicons name="log-out-outline" size={20} color={S.logout} />
          <Text style={styles.logoutText}>יציאה מהחשבון</Text>
        </Pressable>
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
  backHit: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: heebo("700"),
    fontSize: 26,
    color: S.text,
    textAlign: "center",
  },
  scroll: {
    paddingHorizontal: S.padX,
    paddingBottom: 40,
    gap: S.sectionGap,
  },
  profileCard: {
    minHeight: 78,
    borderRadius: S.radiusCard,
    backgroundColor: S.surface,
    paddingHorizontal: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    shadowColor: "#4B392D",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  profileText: { flex: 1 },
  profileName: {
    fontFamily: heebo("700"),
    fontSize: 17,
    color: S.text,
    textAlign: "right",
  },
  profileSub: {
    fontFamily: heebo("400"),
    fontSize: 13,
    color: S.muted,
    textAlign: "right",
    marginTop: 2,
  },
  card: {
    borderRadius: S.radiusCard,
    backgroundColor: S.surface,
    overflow: "hidden",
    shadowColor: "#4B392D",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  row: {
    minHeight: 68,
    paddingHorizontal: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: S.divider,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: S.beige,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowTitle: {
    fontFamily: heebo("600"),
    fontSize: 16,
    color: S.text,
    textAlign: "right",
  },
  rowSub: {
    fontFamily: heebo("400"),
    fontSize: 13,
    color: S.muted,
    textAlign: "right",
    marginTop: 2,
  },
  logout: {
    height: 56,
    borderRadius: 14,
    backgroundColor: S.logoutBg,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  logoutText: {
    fontFamily: heebo("700"),
    fontSize: 16,
    color: S.logout,
  },
});
