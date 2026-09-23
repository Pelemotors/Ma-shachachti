import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listChatSessions, type ChatSessionSummary } from "../../api/chat";
import { CHAT, heebo } from "./chatV4Theme";

function formatWhen(iso: string) {
  const stamp = new Date(iso);
  if (Number.isNaN(stamp.getTime())) return "";
  const now = new Date();
  const time = new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(stamp);
  const sameDay = stamp.toDateString() === now.toDateString();
  if (sameDay) return `היום · ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (stamp.toDateString() === yesterday.toDateString()) return `אתמול · ${time}`;
  const day = new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "short",
  }).format(stamp);
  return `${day} · ${time}`;
}

export function ChatHistoryDrawer({
  open,
  currentSessionId,
  onClose,
  onOpenSession,
  onNewSession,
}: {
  open: boolean;
  currentSessionId: string | null;
  onClose: () => void;
  onOpenSession: (sessionId: string) => void;
  onNewSession: () => void;
}) {
  const insets = useSafeAreaInsets();
  const screenW = Dimensions.get("window").width;
  const width = Math.min(320, Math.round(screenW * 0.82));
  const slide = useRef(new Animated.Value(width)).current;
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 0 : width,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [open, slide, width]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError("");
    void listChatSessions()
      .then((body) => {
        if (!alive) return;
        setSessions(Array.isArray(body.sessions) ? body.sessions : []);
      })
      .catch(() => {
        if (alive) setError("לא הצלחנו לטעון את השיחות.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const ordered = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        const byLast = (b.last_message_at || "").localeCompare(a.last_message_at || "");
        return byLast !== 0 ? byLast : (b.created_at || "").localeCompare(a.created_at || "");
      }),
    [sessions],
  );

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.layer}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="סגירת שיחות" />
        <Animated.View
          style={[
            styles.drawer,
            {
              width,
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 16,
              transform: [{ translateX: slide }],
            },
          ]}
        >
          <View style={styles.head}>
            <Text style={styles.title}>שיחות</Text>
            <Pressable onPress={onClose} accessibilityLabel="סגירה" style={styles.closeHit}>
              <Text style={styles.closeMark}>×</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => {
              if (busy) return;
              setBusy(true);
              onNewSession();
            }}
            accessibilityLabel="שיחה חדשה"
            style={styles.cta}
          >
            <Text style={styles.ctaText}>שיחה חדשה</Text>
          </Pressable>
          {loading ? (
            <ActivityIndicator color={CHAT.sage} style={{ marginTop: 24 }} />
          ) : null}
          {!loading && ordered.length === 0 ? (
            <Text style={styles.empty}>אין עדיין שיחות קודמות</Text>
          ) : null}
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {ordered.map((session) => {
              const selected = session.id === currentSessionId;
              return (
                <Pressable
                  key={session.id}
                  onPress={() => onOpenSession(session.id)}
                  accessibilityLabel={session.preview}
                  accessibilityState={{ selected }}
                  style={[styles.row, selected && styles.rowSelected]}
                >
                  <Text style={styles.preview} numberOfLines={2}>
                    {session.preview || "שיחה חדשה"}
                  </Text>
                  <Text style={styles.meta}>
                    {formatWhen(session.last_message_at || session.created_at)}
                    {selected ? " · נוכחית" : ""}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {error ? <Text style={styles.err}>{error}</Text> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, flexDirection: "row" },
  backdrop: { flex: 1, backgroundColor: "rgba(30,24,20,0.28)" },
  drawer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: CHAT.page,
    paddingHorizontal: 16,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  head: {
    minHeight: 48,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontFamily: heebo("700"),
    fontSize: 24,
    color: CHAT.title,
    textAlign: "right",
    writingDirection: "rtl",
  },
  closeHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  closeMark: { fontSize: 28, color: CHAT.muted, lineHeight: 30 },
  cta: {
    marginTop: 8,
    height: 52,
    borderRadius: 16,
    backgroundColor: CHAT.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { fontFamily: heebo("700"), fontSize: 16, color: "#FFFFFF" },
  list: { marginTop: 16, flex: 1 },
  empty: {
    marginTop: 24,
    fontFamily: heebo("400"),
    fontSize: 14,
    color: CHAT.muted,
    textAlign: "right",
  },
  row: {
    minHeight: 72,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginBottom: 8,
    backgroundColor: CHAT.agentBubble,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CHAT.border,
  },
  rowSelected: {
    backgroundColor: CHAT.userBubble,
    borderColor: CHAT.sage,
  },
  preview: {
    fontFamily: heebo("600"),
    fontSize: 15,
    color: CHAT.text,
    textAlign: "right",
    writingDirection: "rtl",
  },
  meta: {
    marginTop: 4,
    fontFamily: heebo("400"),
    fontSize: 12,
    color: CHAT.muted,
    textAlign: "right",
  },
  err: {
    marginTop: 8,
    fontFamily: heebo("400"),
    fontSize: 13,
    color: CHAT.error,
    textAlign: "right",
  },
});
