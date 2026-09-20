import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { loadChat, sendChat, type MobileChatMessage } from "../api/chat";
import { ErrorText, Field, PrimaryButton, ScreenShell } from "../ui/chrome";

export function ChatScreen({ onBack }: { onBack: () => void }) {
  const [messages, setMessages] = useState<MobileChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadChat()
      .then((data) => {
        setMessages(data.messages);
        setSessionId(data.session_id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "שגיאה"));
  }, []);

  async function send() {
    const message = draft.trim();
    if (!message) return;
    setBusy(true);
    setError("");
    setDraft("");
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: message },
    ]);
    try {
      const data = await sendChat(message, sessionId);
      setSessionId(data.session_id);
      setMessages((prev) => [
        ...prev,
        { id: `reply-${Date.now()}`, role: "assistant", content: data.reply },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שליחה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell title="צ׳אט" onBack={onBack}>
      {messages.map((item) => (
        <View key={item.id} style={styles.bubble}>
          <Text style={styles.role}>{item.role === "user" ? "אתה" : "הסוכן"}</Text>
          <Text style={styles.body}>{item.content}</Text>
        </View>
      ))}
      <Field
        value={draft}
        onChangeText={setDraft}
        placeholder="מה צריך לזכור?"
        multiline
      />
      <PrimaryButton label={busy ? "שולח…" : "שלח"} onPress={() => void send()} disabled={busy} />
      <ErrorText message={error} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  bubble: { backgroundColor: "#fff", borderRadius: 12, padding: 12 },
  role: { textAlign: "right", color: "#8A7464", fontSize: 12, marginBottom: 4 },
  body: { textAlign: "right", color: "#3D2B1F", lineHeight: 22 },
});
