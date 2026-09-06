"use client";
import { Mic, Square } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { authHeaders } from "@/lib/supabase-browser";
export function VoiceButton({
  enabled,
  onText,
  onError,
}: {
  enabled: boolean;
  onText: (s: string) => void;
  onError: (s: string) => void;
}) {
  const [recording, setRecording] = useState(false),
    [loading, setLoading] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current) {
        recorder.current.onstop = null;
        if (recorder.current.state === "recording") recorder.current.stop();
      }
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function toggle() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (!enabled) {
      onError(
        "תמלול קולי זמין אחרי חיבור לחשבון והפעלת עזרה אישית. אפשר להקליד כאן.",
      );
      return;
    }
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error("הדפדפן הזה לא מאפשר הקלטה. אפשר להקליד.");
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      recorder.current = new MediaRecorder(
        stream.current,
        mime ? { mimeType: mime } : undefined,
      );
      const chunks: Blob[] = [];
      recorder.current.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.current.onstop = async () => {
        if (timer.current) clearTimeout(timer.current);
        stream.current?.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setLoading(true);
        try {
          const blob = new Blob(chunks, {
            type: recorder.current?.mimeType ?? "audio/webm",
          });
          const response = await fetch("/api/transcribe", {
            method: "POST",
            headers: await authHeaders(),
            body: blob,
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          onText(data.text);
        } catch (e) {
          onError(e instanceof Error ? e.message : "התמלול לא הצליח");
        } finally {
          setLoading(false);
        }
      };
      recorder.current.start();
      setRecording(true);
      timer.current = setTimeout(
        () =>
          recorder.current?.state === "recording" && recorder.current.stop(),
        90000,
      );
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      onError(e instanceof Error ? e.message : "לא הצלחנו לגשת למיקרופון");
    }
  }
  return (
    <button
      type="button"
      className={"voice " + (recording ? "recording" : "")}
      disabled={loading}
      onClick={toggle}
      aria-label={recording ? "סיום הקלטה" : "הקלטת הודעה"}
    >
      {loading ? "…" : recording ? <Square size={19} /> : <Mic size={21} />}
    </button>
  );
}
