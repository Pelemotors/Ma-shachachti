import { useCallback, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sendChat } from "../../api/chat";
import { completeTask, enableTaskReminder } from "../../api/tasks";
import { transcribeRecording } from "../../api/transcribe";
import type { ProductTab } from "../../components/ui";
import { claimSendLock, homeSendResult, newChatTurnId } from "../../product/surfaceCommit";
import { useMicDisclosureGate } from "../../privacy/micDisclosure";
import { ForgotHeroCard } from "./ForgotHeroCard";
import { HomeBottomNavigation } from "./HomeBottomNavigation";
import { HomeHeader } from "./HomeHeader";
import { QuickActionGrid } from "./QuickActionGrid";
import { SmartReminderCard } from "./SmartReminderCard";
import { TodayOverviewCard } from "./TodayOverviewCard";
import { homeScale, heebo, V4 } from "./homeV4Theme";
import { useHomeV4Data } from "./useHomeV4Data";

export function HomeV4Screen({
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
  const data = useHomeV4Data();
  const mic = useMicDisclosureGate();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [reminderBusy, setReminderBusy] = useState(false);
  const sendLock = useRef(false);

  const send = useCallback(
    async (text?: string) => {
      const message = (text ?? draft).trim();
      if (!message || !claimSendLock(sendLock)) return;
      setSending(true);
      setSendError("");
      try {
        await sendChat(message, null, newChatTurnId());
        const result = homeSendResult(true);
        if (result.clearDraft) setDraft("");
        if (result.navigateToChat) onOpen("chat");
      } catch (err) {
        const result = homeSendResult(false);
        if (result.showError) {
          setSendError(err instanceof Error ? err.message : "השליחה נכשלה");
        }
      } finally {
        sendLock.current = false;
        setSending(false);
      }
    },
    [draft, onOpen],
  );

  async function toggleMic() {
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
        await send(transcribed.text);
      } catch (err) {
        setSendError(err instanceof Error ? err.message : "ההקלטה נכשלה");
        setSending(false);
      }
      return;
    }
    const accepted = await mic.ensureAccepted();
    if (!accepted) return;
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setSendError("אין הרשאת מיקרופון.");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function completeRow(taskId: string | null) {
    if (!taskId) return;
    try {
      await completeTask(taskId);
      await data.reload();
    } catch {
      /* keep current snapshot */
    }
  }

  async function addReminder() {
    if (!data.hasLiveReminder || !data.reminder) return;
    const id = data.reminder.id;
    setReminderBusy(true);
    try {
      await enableTaskReminder(id);
      await data.reload();
    } catch {
      /* keep */
    } finally {
      setReminderBusy(false);
    }
  }

  const secondaryError = data.errors.plan || data.errors.tasks || data.errors.notifications;

  return (
    <View style={[styles.root, { backgroundColor: V4.page }]}>
      {mic.modal}
      <View style={{ height: insets.top, backgroundColor: V4.page }} />
      <HomeHeader
        scale={s}
        greeting={data.greeting}
        avatarUrl={data.avatarUrl}
        unread={data.unread}
        onBell={() => onOpen("notifications")}
        onAvatar={() => onOpen("settings")}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: 12 * s, gap: 12 * s }}
        refreshControl={<RefreshControl refreshing={data.loading} onRefresh={() => void data.reload()} />}
        keyboardShouldPersistTaps="handled"
      >
        <ForgotHeroCard
          scale={s}
          value={draft}
          onChangeText={setDraft}
          onSend={() => void send()}
          onMic={() => void toggleMic()}
          onOpenForgot={() => onOpen("forgot")}
          sending={sending}
          recording={recorderState.isRecording}
          error={sendError}
        />
        <TodayOverviewCard
          scale={s}
          done={data.progressDone}
          total={data.progressTotal}
          rows={data.rows}
          hasPlan={data.hasPlan}
          onShowAll={() => onOpen("schedule")}
          onCreatePlan={() => onOpen("plan")}
          onComplete={(id) => void completeRow(id)}
        />
        <QuickActionGrid scale={s} onOpen={onOpen} />
        <SmartReminderCard
          scale={s}
          candidate={data.reminder}
          busy={reminderBusy}
          onAdd={() => void addReminder()}
        />
        {secondaryError ? (
          <Pressable onPress={() => void data.reload()}>
            <Text style={{ fontFamily: heebo("400"), fontSize: 12 * s, color: V4.muted, textAlign: "center" }}>
              חלק מהנתונים לא נטענו. נגיעה לרענון.
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <HomeBottomNavigation scale={s} active="home" onChange={onTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
});
