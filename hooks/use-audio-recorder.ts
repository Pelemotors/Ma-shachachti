"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type RecorderPhase,
  RECORDER_MAX_SECONDS,
  canFinishRecording,
  canSendTranscript,
  canStartRecording,
  emptyLevels,
  shouldKeepBlobAfterTranscribe,
} from "@/lib/audio/recorder-helpers";

export type { RecorderPhase };
export {
  RECORDER_MAX_SECONDS,
  canFinishRecording,
  canSendTranscript,
  canStartRecording,
  formatRecordingClock,
  shouldKeepBlobAfterTranscribe,
} from "@/lib/audio/recorder-helpers";

const MIC_BLOCKED_HE = "המיקרופון חסום. אפשר לשנות זאת בהרשאות.";
const UNSUPPORTED_HE = "הקלטה קולית לא נתמכת בדפדפן הזה.";
const TRANSCRIBE_FAILED_HE = "לא הצלחנו לתמלל. אפשר לנסות שוב.";

async function microphoneDenied() {
  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return status.state === "denied";
  } catch {
    return false;
  }
}

export function useAudioRecorder() {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => emptyLevels());
  const [error, setError] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const raf = useRef<number | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const startLocked = useRef(false);
  const sendLocked = useRef(false);
  const cancelled = useRef(false);
  const phaseRef = useRef<RecorderPhase>("idle");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const stopAnalyserLoop = useCallback(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);

  const stopTimer = useCallback(() => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const closeAudio = useCallback(() => {
    stopAnalyserLoop();
    void audioCtx.current?.close();
    audioCtx.current = null;
    analyser.current = null;
  }, [stopAnalyserLoop]);

  const cleanup = useCallback(() => {
    stopTimer();
    stopAnalyserLoop();
    const rec = mediaRecorder.current;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop = null;
      if (rec.state === "recording" || rec.state === "paused") {
        try {
          rec.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    mediaRecorder.current = null;
    stopTracks();
    closeAudio();
  }, [closeAudio, stopAnalyserLoop, stopTimer, stopTracks]);

  useEffect(() => () => cleanup(), [cleanup]);

  const startLevelLoop = useCallback(() => {
    const node = analyser.current;
    if (!node) return;
    const data = new Uint8Array(node.fftSize);
    const loop = () => {
      node.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i]! - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setLevels((prev) => [...prev.slice(1), Math.min(1, rms * 4)]);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(async () => {
    if (!canStartRecording(phaseRef.current, startLocked.current)) return;
    startLocked.current = true;
    cancelled.current = false;
    setError("");
    setBlob(null);
    setLevels(emptyLevels());
    setPhase("requesting_permission");
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        throw new Error(UNSUPPORTED_HE);
      }
      if (await microphoneDenied()) {
        setPhase("error");
        setError(MIC_BLOCKED_HE);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelled.current) {
        stream.getTracks().forEach((track) => track.stop());
        setPhase("idle");
        return;
      }
      streamRef.current = stream;
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      audioCtx.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createAnalyser();
      node.fftSize = 256;
      source.connect(node);
      analyser.current = node;
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const rec = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      mediaRecorder.current = rec;
      chunks.current = [];
      rec.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      rec.onstop = () => {
        stopTracks();
        closeAudio();
        stopTimer();
        if (cancelled.current) {
          chunks.current = [];
          setBlob(null);
          setPhase("idle");
          return;
        }
        const recorded = new Blob(chunks.current, {
          type: rec.mimeType || "audio/webm",
        });
        chunks.current = [];
        setBlob(recorded);
        setPhase("preview");
      };
      rec.start(250);
      setSeconds(0);
      setPhase("recording");
      startLevelLoop();
      tick.current = setInterval(() => {
        setSeconds((current) => {
          const next = current + 1;
          if (next >= RECORDER_MAX_SECONDS) {
            stopTimer();
            if (mediaRecorder.current?.state === "recording") {
              mediaRecorder.current.stop();
            }
          }
          return next;
        });
      }, 1000);
    } catch (caught) {
      cleanup();
      setPhase("error");
      const denied =
        caught instanceof DOMException &&
        (caught.name === "NotAllowedError" ||
          caught.name === "PermissionDeniedError");
      setError(
        denied
          ? MIC_BLOCKED_HE
          : caught instanceof Error
            ? caught.message
            : UNSUPPORTED_HE,
      );
    } finally {
      startLocked.current = false;
    }
  }, [cleanup, closeAudio, startLevelLoop, stopTimer, stopTracks]);

  const finish = useCallback(() => {
    if (!canFinishRecording(phaseRef.current)) return;
    stopTimer();
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.stop();
    } else {
      stopTracks();
      closeAudio();
      setPhase("preview");
    }
  }, [closeAudio, stopTimer, stopTracks]);

  const cancel = useCallback(() => {
    cancelled.current = true;
    sendLocked.current = false;
    cleanup();
    setBlob(null);
    setSeconds(0);
    setLevels(emptyLevels());
    setError("");
    setPhase("idle");
  }, [cleanup]);

  const discardPreview = useCallback(() => {
    sendLocked.current = false;
    setBlob(null);
    setSeconds(0);
    setLevels(emptyLevels());
    setError("");
    setPhase("idle");
  }, []);

  const send = useCallback(
    async (
      transcribe: (recorded: Blob) => Promise<string>,
    ): Promise<string | null> => {
      const current = blob;
      if (
        !canSendTranscript(phaseRef.current, !!current, sendLocked.current) ||
        !current
      ) {
        return null;
      }
      sendLocked.current = true;
      setPhase("transcribing");
      setError("");
      try {
        const text = await transcribe(current);
        if (!shouldKeepBlobAfterTranscribe(true)) setBlob(null);
        setSeconds(0);
        setLevels(emptyLevels());
        setPhase("idle");
        return text;
      } catch (caught) {
        setPhase("error");
        setError(
          caught instanceof Error ? caught.message : TRANSCRIBE_FAILED_HE,
        );
        return null;
      } finally {
        sendLocked.current = false;
      }
    },
    [blob],
  );

  return {
    phase,
    seconds,
    levels,
    error,
    blob,
    start,
    finish,
    cancel,
    discardPreview,
    send,
  };
}
