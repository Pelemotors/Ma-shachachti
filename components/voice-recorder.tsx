"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square, Trash2, SendHorizontal } from "lucide-react";
import {
  formatRecordingClock,
  useAudioRecorder,
} from "@/hooks/use-audio-recorder";
import { transcribeAudioBlob } from "@/lib/audio/transcribe-client";

export function VoiceRecorder(props: {
  enabled: boolean;
  disabledHint?: string;
  onText: (text: string) => void | Promise<void>;
  onError?: (msg: string) => void;
  /** When false, block send-to-transcription and ask for consent instead. */
  aiConsent?: boolean;
  onNeedConsent?: () => void;
  variant?: "composer" | "panel";
  ariaLabel?: string;
}) {
  const rec = useAudioRecorder();
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrl = useRef<string | null>(null);
  const variant = props.variant ?? "composer";

  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
    audioRef.current?.pause();
    setPlaying(false);
    if (rec.blob) {
      objectUrl.current = URL.createObjectURL(rec.blob);
    }
  }, [rec.blob]);

  async function handleStart() {
    if (!props.enabled) {
      props.onError?.(
        props.disabledHint ??
          "תמלול קולי זמין אחרי חיבור לחשבון והפעלת עזרה אישית. אפשר להקליד כאן.",
      );
      return;
    }
    await rec.start();
  }

  async function handleSend() {
    if (props.aiConsent === false) {
      props.onNeedConsent?.();
      props.onError?.("כדי לתמלל הקלטה צריך לאשר עזרה אישית בהגדרות הבית.");
      return;
    }
    const text = await rec.send(transcribeAudioBlob);
    if (text) await props.onText(text);
  }

  function togglePlay() {
    if (!objectUrl.current) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(objectUrl.current);
      audioRef.current.onended = () => setPlaying(false);
    } else if (audioRef.current.src !== objectUrl.current) {
      audioRef.current.src = objectUrl.current;
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      void audioRef.current.play();
      setPlaying(true);
    }
  }

  if (rec.phase === "idle" || (rec.phase === "error" && !rec.blob)) {
    return (
      <div className={`voice-recorder voice-recorder--${variant}`}>
        {rec.phase === "error" && rec.error && (
          <p className="voice-recorder__error" role="alert">
            {rec.error}
          </p>
        )}
        <button
          type="button"
          className="voice"
          aria-label={props.ariaLabel ?? "הקלטת הודעה"}
          onClick={() => void handleStart()}
        >
          <Mic size={21} />
        </button>
      </div>
    );
  }

  if (rec.phase === "requesting_permission") {
    return (
      <div
        className={`voice-recorder voice-recorder--${variant} voice-recorder--active`}
        role="status"
        aria-live="polite"
      >
        <span className="muted">מבקשים גישה למיקרופון…</span>
        <button type="button" className="text-button" onClick={rec.cancel}>
          ביטול
        </button>
      </div>
    );
  }

  if (rec.phase === "recording") {
    return (
      <div
        className={`voice-recorder voice-recorder--${variant} voice-recorder--active voice-recorder--recording`}
        role="status"
        aria-live="polite"
        aria-label="מקליטים"
      >
        <button
          type="button"
          className="text-button"
          onClick={rec.cancel}
          aria-label="ביטול הקלטה"
        >
          ביטול
        </button>
        <div className="voice-waveform" aria-hidden="true">
          {rec.levels.map((level, i) => (
            <span
              key={i}
              className="voice-waveform__bar"
              style={{ height: `${Math.max(12, level * 100)}%` }}
            />
          ))}
        </div>
        <span className="voice-recorder__clock" aria-label="משך הקלטה">
          {formatRecordingClock(rec.seconds)}
        </span>
        <button
          type="button"
          className="voice recording"
          onClick={rec.finish}
          aria-label="סיום הקלטה"
        >
          <Square size={17} />
          <span className="voice-recorder__finish-label">סיים</span>
        </button>
      </div>
    );
  }

  // preview | transcribing | error-with-blob
  return (
    <div
      className={`voice-recorder voice-recorder--${variant} voice-recorder--active voice-recorder--preview`}
      role="group"
      aria-label="תצוגה מקדימה של ההקלטה"
    >
      <button
        type="button"
        className="text-button"
        disabled={rec.phase === "transcribing"}
        onClick={rec.discardPreview}
        aria-label="מחיקת הקלטה"
      >
        <Trash2 size={16} />
        מחק
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={rec.phase === "transcribing" || !rec.blob}
        onClick={togglePlay}
        aria-label={playing ? "השהיית השמעה" : "השמעת הקלטה"}
      >
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <span className="voice-recorder__clock">
        {formatRecordingClock(rec.seconds)}
      </span>
      {rec.phase === "error" && rec.error && (
        <span className="voice-recorder__error" role="alert">
          {rec.error}
        </span>
      )}
      <button
        type="button"
        className="primary voice-recorder__send"
        disabled={rec.phase === "transcribing"}
        onClick={() => void handleSend()}
        aria-label={
          rec.phase === "error" ? "נסה שוב תמלול" : "שליחת הקלטה לתמלול"
        }
      >
        {rec.phase === "transcribing" ? (
          "מתמללים…"
        ) : rec.phase === "error" ? (
          "נסה שוב"
        ) : (
          <>
            <SendHorizontal size={16} />
            שלח
          </>
        )}
      </button>
    </div>
  );
}

/** @deprecated Prefer VoiceRecorder — kept as thin alias for existing imports. */
export function VoiceButton(props: {
  enabled: boolean;
  onText: (s: string) => void;
  onError: (s: string) => void;
  aiConsent?: boolean;
  onNeedConsent?: () => void;
  disabledHint?: string;
}) {
  return (
    <VoiceRecorder
      enabled={props.enabled}
      onText={props.onText}
      onError={props.onError}
      aiConsent={props.aiConsent}
      onNeedConsent={props.onNeedConsent}
      disabledHint={props.disabledHint}
      variant="composer"
    />
  );
}
