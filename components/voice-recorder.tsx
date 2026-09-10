"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatRecordingClock,
  useAudioRecorder,
} from "@/hooks/use-audio-recorder";
import { transcribeAudioBlob } from "@/lib/audio/transcribe-client";

function Icon({ path, size = 20 }: { path: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function VoiceRecorder(props: {
  enabled: boolean;
  onText: (text: string) => void | Promise<void>;
  onError?: (message: string) => void;
}) {
  const rec = useAudioRecorder();
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrl = useRef<string | null>(null);

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
    if (rec.blob) objectUrl.current = URL.createObjectURL(rec.blob);
  }, [rec.blob]);

  async function handleStart() {
    if (!props.enabled) {
      props.onError?.("תמלול קולי זמין אחרי חיבור לחשבון.");
      return;
    }
    await rec.start();
  }

  async function handleSend() {
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
      <div className="voice-recorder">
        {rec.phase === "error" && rec.error ? (
          <p className="voice-recorder__error" role="alert">
            {rec.error}
          </p>
        ) : null}
        <button
          type="button"
          className="voice"
          aria-label="הקלטת הודעה"
          onClick={() => void handleStart()}
        >
          <Icon path="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Zm6 8a6 6 0 0 1-12 0M12 17v4M8 21h8" />
        </button>
      </div>
    );
  }

  if (rec.phase === "requesting_permission") {
    return (
      <div
        className="voice-recorder voice-recorder--active"
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
        className="voice-recorder voice-recorder--active voice-recorder--recording"
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
          {rec.levels.map((level, index) => (
            <span
              key={index}
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
          <Icon path="M7 7h10v10H7z" size={16} />
          <span className="voice-recorder__finish-label">סיים</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="voice-recorder voice-recorder--active voice-recorder--preview"
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
        מחק
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={rec.phase === "transcribing" || !rec.blob}
        onClick={togglePlay}
        aria-label={playing ? "השהיית השמעה" : "השמעת הקלטה"}
      >
        {playing ? (
          <Icon path="M8 6h3v12H8Zm5 0h3v12h-3Z" />
        ) : (
          <Icon path="M8 5v14l11-7Z" />
        )}
      </button>
      <span className="voice-recorder__clock">
        {formatRecordingClock(rec.seconds)}
      </span>
      {rec.phase === "error" && rec.error ? (
        <span className="voice-recorder__error" role="alert">
          {rec.error}
        </span>
      ) : null}
      <button
        type="button"
        className="voice-recorder__send"
        disabled={rec.phase === "transcribing"}
        onClick={() => void handleSend()}
        aria-label={
          rec.phase === "error" ? "נסה שוב תמלול" : "שליחת הקלטה לתמלול"
        }
      >
        {rec.phase === "transcribing"
          ? "מתמללים…"
          : rec.phase === "error"
            ? "נסה שוב"
            : "תמלל"}
      </button>
    </div>
  );
}
