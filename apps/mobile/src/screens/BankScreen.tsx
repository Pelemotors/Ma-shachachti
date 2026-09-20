import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { Audio } from "expo-av";
import { sendChat } from "../api/chat";
import { listBankRecordings, uploadBankRecording, type MobileRecording } from "../api/recordings";
import { useMicDisclosureGate } from "../privacy/micDisclosure";
import { ErrorText, Field, Hint, PrimaryButton, ScreenShell } from "../ui/chrome";

export function BankScreen({ onBack }: { onBack: () => void }) {
  const mic = useMicDisclosureGate();
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [items, setItems] = useState<MobileRecording[]>([]);
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setItems((await listBankRecordings()).recordings);
  }, []);

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : "שגיאה"));
    return () => {
      void recordingRef.current?.stopAndUnloadAsync().catch(() => undefined);
    };
  }, [reload]);

  async function startRecording() {
    setError("");
    const accepted = await mic.ensureAccepted();
    if (!accepted) return;
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      setError("אין הרשאת מיקרופון.");
      return;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    const next = new Audio.Recording();
    await next.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await next.startAsync();
    recordingRef.current = next;
    setRecording(true);
  }

  async function stopAndUpload() {
    const current = recordingRef.current;
    recordingRef.current = null;
    setRecording(false);
    if (!current) return;
    setBusy(true);
    try {
      await current.stopAndUnloadAsync();
      const uri = current.getURI();
      const status = await current.getStatusAsync();
      if (!uri) throw new Error("ההקלטה ריקה.");
      const durationMs =
        "durationMillis" in status && typeof status.durationMillis === "number"
          ? status.durationMillis
          : 1000;
      const durationSec = Math.min(90, Math.max(1, Math.round(durationMs / 1000)));
      const blob = await (await fetch(uri)).blob();
      await uploadBankRecording({
        id: crypto.randomUUID(),
        durationSec,
        body: blob,
        contentType: blob.type || "audio/mp4",
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "העלאה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function sendText() {
    const message = draft.trim();
    if (!message) return;
    setBusy(true);
    setError("");
    try {
      await sendChat(message);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שליחה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell title="בנק / קול" onBack={onBack}>
      {mic.modal}
      <Hint>הקלטה עולה לשרת רק אחרי גילוי המיקרופון ואישור מערכת.</Hint>
      <PrimaryButton
        label={recording ? "עצור והעלה" : busy ? "מעלה…" : "הקלט לבנק"}
        onPress={() => void (recording ? stopAndUpload() : startRecording())}
        disabled={busy}
      />
      <Field value={draft} onChangeText={setDraft} placeholder="או כתבו לבנק בטקסט" multiline />
      <PrimaryButton label="שלח טקסט" onPress={() => void sendText()} disabled={busy} />
      <ErrorText message={error} />
      {items.map((item) => (
        <Text key={item.id} style={styles.line}>
          {item.status} · {new Date(item.created_at).toLocaleString("he-IL")}
        </Text>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  line: { textAlign: "right", color: "#5C4033" },
});
