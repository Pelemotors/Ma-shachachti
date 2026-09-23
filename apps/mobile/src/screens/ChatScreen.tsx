import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen, ChatComposer, EmptyState, ScreenHeader } from "../components/ui";
import { loadChat, sendChat, type MobileChatMessage } from "../api/chat";
import {
  chatSendResult,
  claimSendLock,
  newChatTurnId,
  reconcileChatThread,
} from "../product/surfaceCommit";
import { colors, rtlText, space } from "../theme";

export function ChatScreen() {
  const [messages, setMessages] = useState<MobileChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sendLock = useRef(false);

  const reload = useCallback(async (sid?: string | null) => {
    const data = await loadChat(sid ?? undefined);
    setMessages(reconcileChatThread(data.messages));
    setSessionId(data.session_id);
    return data;
  }, []);

  useEffect(() => {
    void reload()
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [reload]);

  async function send() {
    const message = draft.trim();
    if (!message || !claimSendLock(sendLock)) return;
    setSending(true);
    setError("");
    const turnId = newChatTurnId();
    try {
      const data = await sendChat(message, sessionId, turnId);
      const result = chatSendResult(true);
      if (result.clearDraft) setDraft("");
      setSessionId(data.session_id);
      try {
        await reload(data.session_id);
      } catch {
        if (result.appendCanonical) {
          setMessages((prev) =>
            reconcileChatThread([
              ...prev,
              {
                id: data.id ?? `assistant-${data.session_id}-${turnId}`,
                role: "assistant",
                content: data.reply,
              },
            ]),
          );
        }
      }
    } catch (err) {
      const result = chatSendResult(false);
      if (!result.keepOptimistic && result.showError) {
        setError(err instanceof Error ? err.message : "השליחה נכשלה");
      }
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }

  return (
    <AppScreen
      stickToBottom={messages.length > 0}
      footer={
        <View style={styles.footer}>
          {error ? (
            <Pressable onPress={() => void send()} accessibilityLabel="נסי שוב">
              <Text style={styles.error}>{error} · נסי שוב</Text>
            </Pressable>
          ) : null}
          <ChatComposer
            value={draft}
            onChangeText={setDraft}
            onSend={() => void send()}
          />
        </View>
      }
    >
      <ScreenHeader title="שיחה" icon="chatbubble-outline" />
      {loading && messages.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : messages.length === 0 ? (
        <EmptyState title="עוד אין שיחה" body="שאלה פשוטה או תזכורת — כאן." />
      ) : (
        <View style={styles.list}>
          {messages.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.body}>{item.content}</Text>
            </View>
          ))}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  row: {
    minHeight: 56,
    borderRadius: 22,
    backgroundColor: colors.surface,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  body: { ...rtlText, color: colors.text, fontSize: 15 },
  footer: { paddingHorizontal: 24, paddingBottom: 8, gap: 8 },
  error: { ...rtlText, color: "#8B2E1F", fontSize: 13 },
});
