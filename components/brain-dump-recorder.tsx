"use client";

import { useEffect, useRef, useState } from "react";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { processRecordingBlob } from "@/lib/audio/transcribe-client";
import { authFetch } from "@/lib/supabase-browser";

/**
 * Dedicated Brain Dump mic — records, transcribes, then async agent process
 * without appending to chat or sending a chat reply.
 */
export function BrainDumpRecorder(props: {
  enabled: boolean;
  onStatus?: (message: string) => void;
  onError?: (message: string) => void;
}) {
  const rec = useAudioRecorder();
  const autoProcessedIds = useRef(new Set<string>());
  const [status, setStatus] = useState("");
  const onStatusRef = useRef(props.onStatus);
  const onErrorRef = useRef(props.onError);
  onStatusRef.current = props.onStatus;
  onErrorRef.current = props.onError;

  const transcribeBank = (blob: Blob, recordingId: string, durationSeconds: number) =>
    processRecordingBlob(blob, recordingId, durationSeconds, "bank");

  useEffect(() => {
    const id = rec.recordingId;
    if (rec.phase !== "preview" || !rec.blob || !id) return;
    if (autoProcessedIds.current.has(id)) return;
    autoProcessedIds.current.add(id);
    void (async () => {
      try {
        setStatus("מתמלל…");
        onStatusRef.current?.("מתמלל…");
        const transcript = await rec.send(transcribeBank);
        if (!transcript) {
          setStatus("");
          return;
        }
        setStatus("מעבד את ההקלטה…");
        onStatusRef.current?.("מעבד את ההקלטה…");
        const response = await authFetch("/api/brain-dump", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recording_id: id,
            transcript,
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof body.error === "string"
              ? body.error
              : "לא הצלחנו לעבד את ה־Brain Dump.",
          );
        }
        const summary =
          typeof body.summary === "string"
            ? body.summary
            : "ההקלטה עובדה";
        setStatus(summary);
        onStatusRef.current?.(summary);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "לא הצלחנו לעבד את ההקלטה.";
        setStatus("");
        onErrorRef.current?.(message);
      }
    })();
  }, [rec.phase, rec.blob, rec.recordingId, rec.send]);

  async function handleStart() {
    if (!props.enabled) {
      props.onError?.("Brain Dump זמין אחרי חיבור לחשבון.");
      return;
    }
    setStatus("");
    await rec.start();
  }

  return (
    <section className="brain-dump" aria-label="Brain Dump">
      <div className="brain-dump-row">
        {rec.phase === "recording" ? (
          <button
            className="settings-action"
            type="button"
            onClick={() => void rec.finish()}
          >
            עצור הקלטה
          </button>
        ) : (
          <button
            className="text-button"
            type="button"
            disabled={!props.enabled || rec.phase === "transcribing"}
            onClick={() => void handleStart()}
          >
            Brain Dump — הקלטה
          </button>
        )}
        {status ? <small className="muted">{status}</small> : null}
        {rec.error ? <small className="error-box">{rec.error}</small> : null}
      </div>
    </section>
  );
}
