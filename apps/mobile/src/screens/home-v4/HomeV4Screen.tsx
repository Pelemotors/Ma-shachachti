import { useCallback, useRef, useState } from "react";
import { Dimensions, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SystemBottomInset } from "../../layout/systemBottomInset";
import { sendChat } from "../../api/chat";
import { completeTask } from "../../api/tasks";
import { transcribeRecording } from "../../api/transcribe";
import type { ProductTab } from "../../components/ui";
import { useKeyboardHeight } from "../../layout/keyboard";
import { claimSendLock, homeSendResult, newChatTurnId } from "../../product/surfaceCommit";
import { useMicDisclosureGate } from "../../privacy/micDisclosure";
import { HomeBottomNavigation } from "./HomeBottomNavigation";
import { HomeHeader } from "./HomeHeader";
import { HomeFlowerActions } from "./HomeFlowerActions";
import { HomeAgentComposer } from "./HomeAgentComposer";
import { HomeMasterBackdrop } from "./HomeMasterBackdrop";
import { HomeBankButton } from "./HomeBankButton";
import { TodayOverviewCard } from "./TodayOverviewCard";
import { TodayTaskRow } from "./TodayTaskRow";
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

  const secondaryError = data.errors.plan || data.errors.tasks || data.errors.notifications;
  const keyboardHeight = useKeyboardHeight();
  const keyboardOpen = keyboardHeight > 0;
  // When the tab bar is hidden, clear the system nav inset; otherwise sit above the tab chrome.
  const composerBottom = keyboardOpen ? Math.max(12 * s, insets.bottom) : 76 * s;
  const bankBottom = keyboardOpen ? composerBottom + 54 * s : 130 * s;

  return (
    <View style={[styles.root, { backgroundColor: "#FBF7F0" }]}> 
      <HomeMasterBackdrop width={width} height={Dimensions.get("window").height} />
      {mic.modal}
      <View style={{ height: insets.top, backgroundColor: V4.page }} />
      <HomeHeader
        scale={s}
        greeting={data.greeting}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: (keyboardOpen ? 120 : 160) * s, gap: 12 * s }}
        refreshControl={<RefreshControl refreshing={data.loading} onRefresh={() => void data.reload()} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={{ alignItems: "center" }}>
          <HomeFlowerActions
            width={Math.min(width * 0.77, 340)}
            onCreatePlan={() => onOpen("plan")}
            onFreeTime={() => onOpen("freetime")}
            onChecklists={() => onOpen("checklists")}
            onForgot={() => onOpen("forgot")}
          />
        </View>
        <TodayOverviewCard
          scale={s}
          done={data.progressDone}
          total={data.progressTotal}
          rows={data.rows}
          hasMore={data.allRows.length > 2}
          hasPlan={data.hasPlan}
          onCreatePlan={() => onOpen("plan")}
          onOpenSchedule={() => onOpen("schedule")}
          onComplete={(id) => void completeRow(id)}
        />
        {data.allRows.length > 2 ? data.allRows.slice(2).map((row) => (
          <TodayTaskRow
            key={row.id}
            scale={s}
            time={row.time}
            title={row.title}
            icon={row.icon}
            onToggle={() => void completeRow(row.taskId)}
          />
        )) : null}
        {secondaryError ? (
          <Pressable onPress={() => void data.reload()}>
            <Text style={{ fontFamily: heebo("400"), fontSize: 12 * s, color: V4.muted, textAlign: "center" }}>
              חלק מהנתונים לא נטענו. נגיעה לרענון.
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <View
        style={[
          styles.floatingBank,
          {
            left: 0,
            right: 0,
            bottom: bankBottom + keyboardHeight,
          },
        ]}
      >
        <HomeBankButton scale={s} onPress={() => onOpen("bank")} />
      </View>
      <View
        style={[
          styles.floatingComposer,
          {
            left: 16 * s,
            right: 16 * s,
            bottom: composerBottom + keyboardHeight,
          },
        ]}
      > 
        <HomeAgentComposer
          scale={s}
          value={draft}
          onChangeText={setDraft}
          onSend={() => void send()}
          onMic={() => void toggleMic()}
          sending={sending}
          recording={recorderState.isRecording}
          error={sendError}
        />
      </View>
      {keyboardOpen ? <SystemBottomInset /> : <HomeBottomNavigation scale={s} active="home" onChange={onTab} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  floatingComposer: { position: "absolute" },
  floatingBank: { position: "absolute", alignItems: "center" },
});
