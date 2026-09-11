"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatRecordingClock,
  useAudioRecorder,
} from "@/hooks/use-audio-recorder";
import { processRecordingBlob } from "@/lib/audio/transcribe-client";

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoProcessedIds = useRef(new Set<string>());

  useEffect(() => {
    if (!rec.blob) {
      setPreviewUrl(null);
      setPlaying(false);
      return;
    }
    const url = URL.createObjectURL(rec.blob);
    setPreviewUrl(url);
    setPlaying(false);
    return () => URL.revokeObjectURL(url);
  }, [rec.blob]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (previewUrl) audio.src = previewUrl;
    else {
      audio.removeAttribute("src");
      audio.load();
    }
  }, [previewUrl]);

  useEffect(() => {
    const id = rec.recordingId;
    if (rec.phase !== "preview" || !rec.blob || !id) return;
    if (autoProcessedIds.current.has(id)) return;
    autoProcessedIds.current.add(id);
    void rec.send(processRecordingBlob).then(async (text) => {
      if (text) await props.onText(text);
    });
  }, [rec.phase, rec.blob, rec.recordingId, rec.send, props.onText]);

  async function handleStart() {
    if (!props.enabled) {
      props.onError?.("תמלול קולי זמין אחרי חיבור לחשבון.");
      return;
    }
    await rec.start();
  }

  async function handleSend() {
    const text = await rec.send(processRecordingBlob);
    if (text) await props.onText(text);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !previewUrl) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    void audio.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
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
      aria-label="עיבוד ההקלטה"
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
      <audio
        ref={audioRef}
        className="voice-recorder__player"
        playsInline
        preload="metadata"
        onEnded={() => setPlaying(false)}
      />
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
          rec.phase === "error" ? "נסה שוב תמלול" : "תמלול ההקלטה"
        }
      >
        {rec.phase === "transcribing"
          ? "מתמללים…"
          : rec.phase === "error"
            ? "נסה שוב"
            : "מתחילים…"}
      </button>
    </div>
  );
}
