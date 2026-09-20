import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppScreen, ChatComposer, EmptyState, ScreenHeader } from "../components/ui";
import { loadChat, sendChat, type MobileChatMessage } from "../api/chat";
import { colors, rtlText, space } from "../theme";

export function ChatScreen() {
  const [messages, setMessages] = useState<MobileChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    void loadChat()
      .then((data) => {
        setMessages(data.messages);
        setSessionId(data.session_id);
      })
      .catch(() => setMessages([]));
  }, []);

  async function send() {
    const message = draft.trim();
    if (!message) return;
    setDraft("");
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content: message }]);
    try {
      const data = await sendChat(message, sessionId);
      setSessionId(data.session_id);
      setMessages((prev) => [
        ...prev,
        { id: `reply-${Date.now()}`, role: "assistant", content: data.reply },
      ]);
    } catch {
      /* keep optimistic user line */
    }
  }

  return (
    <AppScreen
      footer={
        <View style={styles.footer}>
          <ChatComposer value={draft} onChangeText={setDraft} onSend={() => void send()} />
        </View>
      }
    >
      <ScreenHeader title="שיחה" icon="chatbubble-outline" />
      {messages.length === 0 ? (
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
  footer: { paddingHorizontal: 24, paddingBottom: 8 },
});
