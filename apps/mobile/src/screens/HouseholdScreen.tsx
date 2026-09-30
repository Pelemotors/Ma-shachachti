import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getHousehold, householdAction, type HouseholdPayload } from "../api/household";
import {
  getProfile,
  updateProfile,
  type HouseholdContext,
} from "../api/profile";
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
  const [context, setContext] = useState<HouseholdContext>({
    adults: 0,
    children: 0,
    babies: 0,
    rooms: 0,
    bathrooms: 0,
    floors: 0,
    features: [],
    pets: [],
    free_text: "",
  });
  const [contextBusy, setContextBusy] = useState(false);
  const featureOptions = ["מרפסת", "גינה", "מעלית", "ממ״ד", "מדרגות", "חניה"];

  const reload = useCallback(async () => {
    setData(await getHousehold());
  }, []);

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : "שגיאה"));
    void getProfile()
      .then((p) => {
        if (p.profile.display_name) setMyName(p.profile.display_name);
        if (p.profile.avatar_url) setMyAvatar(p.profile.avatar_url);
        if (p.profile.household_context) setContext(p.profile.household_context);
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

  function setCount(key: "adults" | "children" | "babies" | "rooms" | "bathrooms" | "floors", value: string) {
    const parsed = Number(value.replace(/[^0-9]/g, ""));
    setContext((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  }

  async function saveContext() {
    setContextBusy(true);
    setError("");
    try {
      const result = await updateProfile({ household_context: context });
      if (result.profile.household_context) setContext(result.profile.household_context);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת פרטי הבית נכשלה");
    } finally {
      setContextBusy(false);
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
        <Text style={styles.sectionTitle}>הבית שלי</Text>
        <Text style={styles.note}>המידע משמש להקשר אישי בלבד ואינו יוצר משימות או תזכורות.</Text>
        <View style={styles.card}>
          {([
            ["adults", "מבוגרים"],
            ["children", "ילדים"],
            ["babies", "תינוקות"],
            ["rooms", "חדרים"],
            ["bathrooms", "חדרי רחצה"],
            ["floors", "קומות"],
          ] as const).map(([key, label]) => (
            <View key={key} style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{label}</Text>
              <TextInput
                value={String(context[key])}
                onChangeText={(value) => setCount(key, value)}
                keyboardType="number-pad"
                style={styles.countInput}
                textAlign="center"
                maxLength={2}
              />
            </View>
          ))}
        </View>

        <Text style={styles.label}>מאפייני הבית</Text>
        <View style={styles.chips}>
          {featureOptions.map((feature) => {
            const selected = context.features.includes(feature);
            return (
              <Pressable
                key={feature}
                onPress={() => setContext((current) => ({
                  ...current,
                  features: selected
                    ? current.features.filter((item) => item !== feature)
                    : [...current.features, feature],
                }))}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={styles.chipText}>{feature}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>חיות מחמד</Text>
        <TextInput
          value={context.pets.join(", ")}
          onChangeText={(value) => setContext((current) => ({
            ...current,
            pets: value.split(",").map((item) => item.trim()).filter(Boolean),
          }))}
          placeholder="למשל: כלב, חתול"
          placeholderTextColor={S.muted}
          style={styles.textInput}
          textAlign="right"
        />

        <Text style={styles.label}>עוד משהו שחשוב לדעת</Text>
        <TextInput
          value={context.free_text}
          onChangeText={(value) => setContext((current) => ({ ...current, free_text: value }))}
          placeholder="פרטים על הבית והמשפחה"
          placeholderTextColor={S.muted}
          style={[styles.textInput, styles.multiline]}
          textAlign="right"
          multiline
          maxLength={2000}
        />
        <Pressable style={styles.save} disabled={contextBusy} onPress={() => void saveContext()}>
          <Text style={styles.secondaryText}>{contextBusy ? "שומר…" : "שמירת פרטי הבית"}</Text>
        </Pressable>

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
  sectionTitle: {
    fontFamily: heebo("700"),
    fontSize: 21,
    color: S.text,
    textAlign: "right",
    marginBottom: 4,
  },
  fieldRow: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: S.divider,
  },
  fieldLabel: { fontFamily: heebo("600"), fontSize: 15, color: S.text },
  countInput: {
    width: 52,
    height: 36,
    borderRadius: 10,
    backgroundColor: S.beige2,
    color: S.text,
    fontFamily: heebo("600"),
  },
  label: {
    marginTop: 18,
    marginBottom: 7,
    fontFamily: heebo("600"),
    fontSize: 14,
    color: S.text,
    textAlign: "right",
  },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: S.beige2,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: S.surface,
  },
  chipSelected: { backgroundColor: S.beige, borderColor: S.camel },
  chipText: { fontFamily: heebo("600"), fontSize: 13, color: S.darkBrown },
  textInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: S.beige2,
    backgroundColor: S.surface,
    paddingHorizontal: 12,
    color: S.text,
    fontFamily: heebo("400"),
  },
  multiline: { minHeight: 96, textAlignVertical: "top", paddingTop: 12 },
  save: {
    marginTop: 16,
    height: 48,
    borderRadius: 14,
    backgroundColor: S.camel,
    alignItems: "center",
    justifyContent: "center",
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
