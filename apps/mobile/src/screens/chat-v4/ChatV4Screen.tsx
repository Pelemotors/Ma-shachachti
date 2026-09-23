import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createChatSession, loadChat, sendChat } from "../../api/chat";
import { createTask, listTasks } from "../../api/tasks";
import { transcribeRecording } from "../../api/transcribe";
import type { ProductTab } from "../../components/ui";
import {
  claimSendLock,
  newChatTurnId,
  reconcileChatThread,
} from "../../product/surfaceCommit";
import { useMicDisclosureGate } from "../../privacy/micDisclosure";
import { HomeBottomNavigation } from "../home-v4/HomeBottomNavigation";
import { AgentSparkle } from "./AgentSparkle";
import { ChatMessageAgent } from "./ChatMessageAgent";
import { ChatMessageUser } from "./ChatMessageUser";
import { ChatQuickChips } from "./ChatQuickChips";
import { ChatTypingBubble } from "./ChatTypingBubble";
import { ChatV4Composer } from "./ChatV4Composer";
import { ChatHistoryDrawer } from "./ChatHistoryDrawer";
import { ChatV4Header } from "./ChatV4Header";
import { CHAT_V4_VISUAL_QA, chatV4Fixture } from "./chatV4Fixture";
import {
  domainChanged,
  loadDomainSnapshot,
  replyClaimsDomainAction,
} from "./chatActionTruth";
import { CHAT, heebo, homeScale } from "./chatV4Theme";
import type { ChatV4Row } from "./chatV4Types";
import { useChatV4Chrome } from "./useChatV4Chrome";

export function ChatV4Screen({
  width,
  onOpen,
  onTab,
}: {
  width: number;
  onOpen: (screen: string) => void;
  onTab: (tab: ProductTab) => void;
}) {
  const s = homeScale(width);
  const insets = useSafeAreaInsets();
  const chrome = useChatV4Chrome();
  const mic = useMicDisclosureGate();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const listRef = useRef<FlatList<ChatV4Row>>(null);
  const sendLock = useRef(false);
  const userScrolled = useRef(false);

  const [messages, setMessages] = useState<ChatV4Row[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [taskDraft, setTaskDraft] = useState("");
  const [taskBusy, setTaskBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const visualQa = __DEV__ && CHAT_V4_VISUAL_QA;

  const reload = useCallback(async (sid?: string | null) => {
    if (visualQa) {
      setMessages(chatV4Fixture.messages);
      setSessionId(chatV4Fixture.sessionId);
      return;
    }
    const data = await loadChat(sid ?? undefined);
    setMessages(reconcileChatThread(data.messages));
    setSessionId(data.session_id);
  }, [visualQa]);

  useEffect(() => {
    void reload()
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [reload]);

  function scrollToLatest() {
    if (userScrolled.current) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }

  async function sendText(raw: string, retryId?: string) {
    const message = raw.trim();
    if (!message || visualQa || !claimSendLock(sendLock)) return;
    userScrolled.current = false;
    setSending(true);
    setError("");
    setOffline(false);
    const turnId = newChatTurnId();
    const localId = retryId ?? `local-${turnId}`;
    const now = new Date().toISOString();
    setMessages((prev) => {
      const without = prev.filter((row) => row.id !== localId);
      return [
        ...without,
        { id: localId, role: "user", content: message, created_at: now, pending: true },
      ];
    });
    setDraft("");
    const before = await loadDomainSnapshot().catch(() => null);
    try {
      const data = await sendChat(message, sessionId, turnId);
      setSessionId(data.session_id);
      try {
        await reload(data.session_id);
      } catch {
        setMessages((prev) =>
          reconcileChatThread([
            ...prev.filter((row) => row.id !== localId),
            { id: `user-${turnId}`, role: "user", content: message, created_at: now },
            {
              id: data.id ?? `assistant-${data.session_id}-${turnId}`,
              role: "assistant",
              content: data.reply,
              created_at: data.created_at,
            },
          ]),
        );
      }
      if (data.mutations) {
        if (data.mutations.ok > 0) {
          void listTasks();
        }
        if (data.mutations.failed > 0 && data.mutations.ok === 0) {
          setError("הפעולה לא נשמרה. אפשר לנסות שוב.");
        }
      } else if (data.reply && replyClaimsDomainAction(data.reply) && before) {
        const after = await loadDomainSnapshot().catch(() => null);
        if (after && !domainChanged(before, after)) {
          setError("הפעולה לא נשמרה. אפשר לנסות שוב.");
        }
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : "השליחה נכשלה";
      const net = /network|fetch|internet|Failed/i.test(text);
      setOffline(net);
      setError(net ? "השליחה דורשת חיבור." : text);
      setMessages((prev) =>
        prev.map((row) => (row.id === localId ? { ...row, pending: false, failed: true } : row)),
      );
      if (retryId) setDraft(message);
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }

  async function toggleMic() {
    if (visualQa) return;
    if (recorderState.isRecording) {
      setSending(true);
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new Error("ההקלטה ריקה.");
        const blob = await (await fetch(uri)).blob();
        const transcribed = await transcribeRecording({
          body: blob,
          contentType: blob.type || "audio/mp4",
        });
        if (!transcribed.text.trim()) throw new Error("לא הצלחנו לתמלל.");
        await sendText(transcribed.text);
      } catch (err) {
        setError(err instanceof Error ? err.message : "ההקלטה נכשלה");
        setSending(false);
      }
      return;
    }
    const accepted = await mic.ensureAccepted();
    if (!accepted) return;
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError("אין הרשאת מיקרופון. אפשר להקליד.");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function addTask() {
    const title = taskDraft.trim();
    if (!title || taskBusy) return;
    setTaskBusy(true);
    try {
      await createTask(title);
      setTaskDraft("");
      setAddingTask(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו להוסיף משימה.");
    } finally {
      setTaskBusy(false);
    }
  }

  async function openSession(id: string) {
    if (visualQa) return;
    setHistoryOpen(false);
    setLoading(true);
    setError("");
    try {
      await reload(id);
    } catch {
      setError("לא הצלחנו לטעון את השיחה.");
    } finally {
      setLoading(false);
    }
  }

  async function startNewChat() {
    if (visualQa) return;
    setHistoryOpen(false);
    setError("");
    try {
      const created = await createChatSession();
      setSessionId(created.session_id);
      setMessages([]);
      setDraft("");
    } catch {
      setError("לא הצלחנו לפתוח שיחה חדשה.");
    }
  }

  function onChip(id: "task" | "plan" | "shopping") {
    if (id === "task") {
      setAddingTask(true);
      return;
    }
    if (id === "plan") {
      onOpen("plan");
      return;
    }
    onTab("shopping");
  }

  const last = messages[messages.length - 1];
  const showChips = !sending && (messages.length === 0 || last?.role === "assistant");

  return (
    <View style={[styles.root, { backgroundColor: CHAT.page }]}>
      {mic.modal}
      <View style={{ height: insets.top, backgroundColor: CHAT.page }} />
      <ChatV4Header
        scale={s}
        avatarUrl={chrome.avatarUrl}
        unread={chrome.unread}
        onBell={() => onOpen("notifications")}
        onAvatar={() => onOpen("privacy")}
        onHistory={() => setHistoryOpen(true)}
      />
      <ChatHistoryDrawer
        open={historyOpen}
        currentSessionId={sessionId}
        onClose={() => setHistoryOpen(false)}
        onOpenSession={(id) => void openSession(id)}
        onNewSession={() => void startNewChat()}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          style={styles.flex}
          extraData={messages}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 8 * s, paddingBottom: 12 * s, gap: 10 * s, flexGrow: 1 }}
          onContentSizeChange={scrollToLatest}
          onScrollBeginDrag={() => {
            userScrolled.current = true;
          }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={{ paddingTop: 64 * s, alignItems: "center", paddingHorizontal: 32 * s }}>
              <AgentSparkle size={28 * s} />
              {loading ? null : (
                <>
                  <Text
                    style={{
                      fontFamily: heebo("600"),
                      fontSize: 16 * s,
                      color: CHAT.text,
                      textAlign: "center",
                      marginTop: 16 * s,
                    }}
                  >
                    עוד לא התחלנו לשוחח
                  </Text>
                  <Text
                    style={{
                      fontFamily: heebo("400"),
                      fontSize: 13 * s,
                      color: CHAT.muted,
                      textAlign: "center",
                      marginTop: 6 * s,
                    }}
                  >
                    שאלה, תזכורת או משימה — כאן.
                  </Text>
                </>
              )}
            </View>
          }
          ListFooterComponent={
            sending ? (
              <View style={{ paddingTop: 4 * s }}>
                <ChatTypingBubble scale={s} />
              </View>
            ) : error ? (
              <Pressable
                onPress={() => {
                  const failed = [...messages].reverse().find((row) => row.failed);
                  if (failed) void sendText(failed.content, failed.id);
                }}
                accessibilityLabel="נסה שוב"
                style={{
                  marginHorizontal: 16 * s,
                  backgroundColor: CHAT.errorSoft,
                  borderRadius: 16 * s,
                  padding: 12 * s,
                }}
              >
                <Text
                  style={{
                    fontFamily: heebo("500"),
                    fontSize: 13 * s,
                    color: CHAT.error,
                    textAlign: "right",
                  }}
                >
                  {offline ? "השליחה דורשת חיבור." : error} נסה שוב
                </Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={{ width: "100%" }}>
              {item.role === "user" ? (
                <ChatMessageUser
                  item={item}
                  scale={s}
                  onRetry={() => void sendText(item.content, item.id)}
                />
              ) : (
                <ChatMessageAgent item={item} scale={s} />
              )}
            </View>
          )}
        />
        <View>
          {showChips ? <ChatQuickChips scale={s} onChip={onChip} /> : null}
          <ChatV4Composer
            scale={s}
            value={draft}
            onChangeText={setDraft}
            onSend={() => void sendText(draft)}
            onMic={() => void toggleMic()}
            sending={sending}
            recording={recorderState.isRecording}
          />
        </View>
      </KeyboardAvoidingView>
      <HomeBottomNavigation scale={s} active="chat" onChange={onTab} />

      <Modal visible={addingTask} transparent animationType="fade">
        <Pressable style={styles.backdrop} onPress={() => setAddingTask(false)}>
          <Pressable
            style={[styles.sheet, { padding: 20 * s, borderRadius: 20 * s }]}
            onPress={() => undefined}
          >
            <Text style={{ fontFamily: heebo("700"), fontSize: 16 * s, color: CHAT.text, textAlign: "right" }}>
              הוסף משימה
            </Text>
            <TextInput
              value={taskDraft}
              onChangeText={setTaskDraft}
              placeholder="מה צריך לעשות?"
              placeholderTextColor={CHAT.muted}
              style={{
                marginTop: 12 * s,
                borderRadius: 16 * s,
                backgroundColor: CHAT.page,
                paddingHorizontal: 12 * s,
                paddingVertical: 10 * s,
                fontFamily: heebo("400"),
                fontSize: 14 * s,
                color: CHAT.text,
                textAlign: "right",
              }}
            />
            <Pressable
              onPress={() => void addTask()}
              disabled={taskBusy}
              accessibilityLabel="שמור משימה"
              style={{
                marginTop: 12 * s,
                backgroundColor: CHAT.sage,
                borderRadius: 16 * s,
                paddingVertical: 12 * s,
              }}
            >
              <Text
                style={{
                  fontFamily: heebo("600"),
                  fontSize: 14 * s,
                  color: "#FFFFFF",
                  textAlign: "center",
                }}
              >
                שמירה
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(30,24,20,0.28)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: { backgroundColor: CHAT.agentBubble },
});
