import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getHousehold, householdAction, type HouseholdPayload } from "../api/household";
import { getProfile } from "../api/profile";
import { useAuth } from "../auth/AuthContext";
import { UserAvatar } from "../components/UserAvatar";
import { heebo } from "./home-v4/homeV4Theme";
import { S } from "./settings/settingsTheme";

export function HouseholdScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [data, setData] = useState<HouseholdPayload | null>(null);
  const [myName, setMyName] = useState(user?.email?.split("@")[0] ?? "אני");
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState("");

  const reload = useCallback(async () => {
    setData(await getHousehold());
  }, []);

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : "שגיאה"));
    void getProfile()
      .then((p) => {
        if (p.profile.display_name) setMyName(p.profile.display_name);
        if (p.profile.avatar_url) setMyAvatar(p.profile.avatar_url);
      })
      .catch(() => undefined);
  }, [reload]);

  async function run(action: "create" | "invite" | "leave") {
    setBusy(true);
    setError("");
    try {
      const result = await householdAction(action, { title: "הבית" });
      if (result.token) setInvite(result.token);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "פעולה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  const others = (data?.members ?? []).filter((m) => m.user_id !== user?.id);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backHit} accessibilityLabel="חזרה">
          <Ionicons name="chevron-forward" size={22} color={S.darkBrown} />
        </Pressable>
        <Text style={styles.title}>משק בית</Text>
        <View style={styles.backHit} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sub}>האנשים והחברים בבית</Text>

        <View style={styles.card}>
          <View style={styles.member}>
            <UserAvatar uri={myAvatar} size="household" />
            <View style={styles.memberText}>
              <Text style={styles.memberName}>{myName}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>אתה</Text>
            </View>
          </View>

          {others.map((m) => (
            <View key={m.user_id} style={[styles.member, styles.borderTop]}>
              <UserAvatar uri={null} size="household" />
              <View style={styles.memberText}>
                <Text style={styles.memberName}>
                  {m.role === "partner" ? "שותף/ה" : "חבר/ה"}
                </Text>
              </View>
              <View style={[styles.badge, styles.badgeMuted]}>
                <Text style={styles.badgeText}>שותף/ה</Text>
              </View>
            </View>
          ))}
        </View>

        {!data?.household ? (
          <Pressable
            style={styles.secondary}
            disabled={busy}
            onPress={() => void run("create")}
          >
            <Text style={styles.secondaryText}>
              {busy ? "יוצרים…" : "יצירת משק בית"}
            </Text>
          </Pressable>
        ) : others.length === 0 ? (
          <>
            <Pressable
              style={styles.secondary}
              disabled={busy}
              onPress={() => void run("invite")}
            >
              <Ionicons name="add" size={18} color={S.darkBrown} />
              <Text style={styles.secondaryText}>הוסף בן/בת זוג</Text>
            </Pressable>
            {invite ? (
              <Text style={styles.invite}>קוד הזמנה חד־פעמי: {invite}</Text>
            ) : (
              <Text style={styles.note}>
                הזמנה תיצור קוד חד־פעמי לשיתוף עם בן/בת הזוג.
              </Text>
            )}
          </>
        ) : null}

        {busy ? <ActivityIndicator color={S.camel} style={{ marginTop: 12 }} /> : null}
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
  sub: {
    fontFamily: heebo("400"),
    fontSize: 14,
    color: S.muted,
    textAlign: "right",
    marginBottom: 16,
  },
  card: {
    borderRadius: S.radiusCard,
    backgroundColor: S.surface,
    overflow: "hidden",
  },
  member: {
    minHeight: 68,
    paddingHorizontal: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  borderTop: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: S.divider,
  },
  memberText: { flex: 1 },
  memberName: {
    fontFamily: heebo("600"),
    fontSize: 16,
    color: S.text,
    textAlign: "right",
  },
  badge: {
    backgroundColor: S.beige,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeMuted: { backgroundColor: S.beige2 },
  badgeText: { fontFamily: heebo("600"), fontSize: 12, color: S.darkBrown },
  secondary: {
    marginTop: 16,
    height: 48,
    borderRadius: 14,
    backgroundColor: S.beige,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  secondaryText: { fontFamily: heebo("600"), fontSize: 15, color: S.darkBrown },
  invite: {
    marginTop: 12,
    fontFamily: heebo("600"),
    fontSize: 14,
    color: S.text,
    textAlign: "center",
  },
  note: {
    marginTop: 10,
    fontFamily: heebo("400"),
    fontSize: 13,
    color: S.muted,
    textAlign: "center",
  },
  err: {
    marginTop: 12,
    fontFamily: heebo("400"),
    color: S.logout,
    textAlign: "center",
  },
});
