import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiRequest } from "../api/client";
import {
  openAppNotificationSettings,
  resolveNativePushToken,
  revokeNativePushRegistration,
  watchForegroundPushRefresh,
} from "../notifications/pushLifecycle";
import { registerNativePushDevice } from "../notifications/registerDevice";
import { heebo } from "./home-v4/homeV4Theme";
import { S } from "./settings/settingsTheme";

type Prefs = {
  default_reminder_minutes: number;
  kinds: Record<string, boolean>;
  developer_comms_enabled?: boolean;
};

type PermState = "granted" | "denied" | "blocked" | "undetermined";

/** Defer native EventEmitter until screen use — avoids boot "runtime not ready". */
async function loadNotifications() {
  return import("expo-notifications");
}

const TYPE_ROWS: Array<{ key: string; label: string }> = [
  { key: "REMINDER", label: "תזכורות" },
  { key: "TASK", label: "משימות וצ׳קליסטים" },
  { key: "SHOPPING", label: "רשימות קניות" },
];

export function NotificationSettingsScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<Prefs>({
    default_reminder_minutes: 30,
    kinds: {},
  });
  const [perm, setPerm] = useState<PermState>("undetermined");
  const [masterOn, setMasterOn] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshPerm = useCallback(async () => {
    const Notifications = await loadNotifications();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      setPerm("granted");
      setMasterOn(true);
      return;
    }
    if (current.canAskAgain === false) {
      setPerm("blocked");
      setMasterOn(false);
      return;
    }
    if (current.status === "denied") {
      setPerm("denied");
      setMasterOn(false);
      return;
    }
    setPerm("undetermined");
    setMasterOn(false);
  }, []);

  useEffect(() => {
    void apiRequest<Prefs>("/api/preferences")
      .then(setPrefs)
      .catch((err) => setError(err instanceof Error ? err.message : "שגיאה"));
    void refreshPerm();
    const poll = setInterval(() => {
      void refreshPerm();
    }, 2000);
    const stop = watchForegroundPushRefresh(() => {
      void refreshPerm();
    });
    return () => {
      clearInterval(poll);
      stop();
    };
  }, [refreshPerm]);

  async function registerDeviceIfPossible() {
    try {
      const token = await resolveNativePushToken();
      await registerNativePushDevice({
        pushToken: token,
        permission: "GRANTED",
      });
    } catch {
      /* token registration is best-effort on Expo Go / missing projectId */
    }
  }

  async function toggleMaster(next: boolean) {
    setError("");
    if (!next) {
      setMasterOn(false);
      try {
        await revokeNativePushRegistration();
      } catch {
        /* local off still stands */
      }
      return;
    }
    const Notifications = await loadNotifications();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      setMasterOn(true);
      setPerm("granted");
      await registerDeviceIfPossible();
      return;
    }
    if (current.canAskAgain === false) {
      setPerm("blocked");
      await openAppNotificationSettings();
      return;
    }
    const asked = await Notifications.requestPermissionsAsync();
    if (asked.granted) {
      setPerm("granted");
      setMasterOn(true);
      await registerDeviceIfPossible();
      return;
    }
    setPerm(asked.canAskAgain === false ? "blocked" : "denied");
    setMasterOn(false);
  }

  async function saveKinds() {
    setBusy(true);
    setError("");
    try {
      setPrefs(
        await apiRequest<Prefs>("/api/preferences", {
          method: "PUT",
          body: JSON.stringify(prefs),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backHit} accessibilityLabel="חזרה">
          <Ionicons name="chevron-forward" size={22} color={S.darkBrown} />
        </Pressable>
        <Text style={styles.title}>התראות</Text>
        <View style={styles.backHit} />
      </View>

      <View style={styles.card}>
        <View style={styles.master}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>התראות פעילות</Text>
            <Text style={styles.rowSub}>הרשאת מכשיר + העדפה באפליקציה</Text>
          </View>
          <Switch
            value={masterOn && perm === "granted"}
            onValueChange={(v) => void toggleMaster(v)}
            trackColor={{ false: "#D9D3CB", true: S.camel }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      <View
        style={[
          styles.statusCard,
          perm === "granted" ? styles.statusOk : styles.statusWarn,
        ]}
      >
        <Text style={styles.statusTitle}>
          {perm === "granted"
            ? "הרשאת התראות במכשיר — מאושר"
            : perm === "blocked"
              ? "נחסם בהגדרות המכשיר"
              : "הרשאת התראות — לא אושרה"}
        </Text>
        {perm !== "granted" ? (
          <Pressable
            style={styles.statusBtn}
            onPress={() =>
              void (perm === "blocked" ? openAppNotificationSettings() : toggleMaster(true))
            }
          >
            <Text style={styles.statusBtnText}>
              {perm === "blocked" ? "פתח הגדרות מערכת" : "אפשר התראות"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.section}>סוגי התראות</Text>
      <View style={styles.card}>
        {TYPE_ROWS.map((row, i) => {
          const on = prefs.kinds[row.key] !== false;
          return (
            <View
              key={row.key}
              style={[styles.typeRow, i < TYPE_ROWS.length - 1 && styles.border]}
            >
              <Text style={styles.rowTitle}>{row.label}</Text>
              <Switch
                value={on}
                onValueChange={(v) =>
                  setPrefs((prev) => ({
                    ...prev,
                    kinds: { ...prev.kinds, [row.key]: v },
                  }))
                }
                trackColor={{ false: "#D9D3CB", true: S.camel }}
                thumbColor="#FFFFFF"
              />
            </View>
          );
        })}
      </View>

      <Pressable style={styles.save} onPress={() => void saveKinds()} disabled={busy}>
        <Text style={styles.saveText}>{busy ? "שומר…" : "שמירת העדפות"}</Text>
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
    marginBottom: 14,
  },
  master: {
    minHeight: 72,
    paddingHorizontal: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  rowTitle: { fontFamily: heebo("600"), fontSize: 16, color: S.text, textAlign: "right" },
  rowSub: { fontFamily: heebo("400"), fontSize: 13, color: S.muted, textAlign: "right" },
  statusCard: {
    borderRadius: S.radiusCard,
    padding: 16,
    marginBottom: 14,
    minHeight: 100,
  },
  statusOk: { backgroundColor: S.success },
  statusWarn: { backgroundColor: S.beige },
  statusTitle: {
    fontFamily: heebo("600"),
    fontSize: 15,
    color: S.text,
    textAlign: "right",
  },
  statusBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: S.camel,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 40,
    justifyContent: "center",
  },
  statusBtnText: { fontFamily: heebo("700"), color: "#fff", fontSize: 14 },
  section: {
    fontFamily: heebo("700"),
    fontSize: 18,
    color: S.text,
    textAlign: "right",
    marginBottom: 8,
  },
  typeRow: {
    minHeight: 58,
    paddingHorizontal: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: S.divider },
  save: {
    height: 54,
    borderRadius: 14,
    backgroundColor: S.camel,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  saveText: { fontFamily: heebo("700"), fontSize: 16, color: "#fff" },
  err: { marginTop: 10, color: S.logout, textAlign: "center", fontFamily: heebo("400") },
});
