"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import type { RecordingRow } from "@/lib/recordings";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states";

const STATUS_HE: Record<RecordingRow["status"], string> = {
  uploading: "מעלה",
  processing: "מתמלל",
  ready: "מוכן",
  error: "שגיאה",
};

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function RecordingBank() {
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError("");
    const response = await authFetch("/api/recordings").catch(() => null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok || !Array.isArray(body?.recordings)) {
      setError(body?.error ?? "לא הצלחנו לטעון את ההקלטות.");
    } else {
      setRecordings(body.recordings as RecordingRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function openAudio(id: string) {
    setBusyId(id);
    setError("");
    const response = await authFetch(`/api/recordings/${id}/audio`).catch(
      () => null,
    );
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok || typeof body?.url !== "string") {
      setError(body?.error ?? "לא הצלחנו לפתוח את קובץ האודיו.");
    } else {
      setAudioUrls((current) => ({ ...current, [id]: body.url }));
    }
    setBusyId(null);
  }

  async function retry(id: string) {
    setBusyId(id);
    setError("");
    const response = await authFetch(`/api/recordings/${id}/retry`, {
      method: "POST",
    }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok || !body?.recording) {
      setError(body?.error ?? "הניסיון החוזר נכשל.");
    } else {
      setRecordings((current) =>
        current.map((item) => (item.id === id ? body.recording : item)),
      );
    }
    setBusyId(null);
  }

  async function remove(id: string, audioOnly: boolean) {
    const message = audioOnly
      ? "למחוק את קובץ האודיו? התמלול והפרטים יישמרו."
      : "למחוק את ההקלטה, האודיו והתמלול לצמיתות?";
    if (!window.confirm(message)) return;
    setBusyId(id);
    setError("");
    const suffix = audioOnly ? "?audioOnly=true" : "";
    const response = await authFetch(`/api/recordings/${id}${suffix}`, {
      method: "DELETE",
    }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setError(body?.error ?? "לא הצלחנו למחוק את ההקלטה.");
    } else if (audioOnly) {
      const deletedAt = new Date().toISOString();
      setRecordings((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, storage_path: null, audio_deleted_at: deletedAt }
            : item,
        ),
      );
      setAudioUrls((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } else {
      setRecordings((current) => current.filter((item) => item.id !== id));
    }
    setBusyId(null);
  }

  if (loading) {
    return <div className="recording-bank"><LoadingState label="טוען הקלטות…" /></div>;
  }

  return (
    <section className="recording-bank" aria-label="בנק הקלטות">
      <div className="recording-bank__heading">
        <div>
          <h1>בנק הקלטות</h1>
          <p>האודיו נשמר באופן פרטי ונמחק אוטומטית אחרי 7 ימים.</p>
        </div>
        <button className="text-button" type="button" onClick={() => void load()}>
          רענון
        </button>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : null}
      {recordings.length === 0 ? (
        <EmptyState
          title="אין עדיין הקלטות"
          description="הקלטות קוליות מהשיחה יופיעו כאן."
        />
      ) : (
        <ul className="recording-list">
          {recordings.map((recording) => (
            <li key={recording.id} className="recording-card">
              <div className="recording-card__meta">
                <span className={`recording-status ${recording.status}`}>
                  {STATUS_HE[recording.status]}
                </span>
                <time dateTime={recording.created_at}>
                  {new Date(recording.created_at).toLocaleString("he-IL")}
                </time>
                <span>{formatDuration(recording.duration_seconds)}</span>
                <span>{Math.max(1, Math.round(recording.size / 1024))} KB</span>
              </div>
              {recording.transcript ? (
                <p className="recording-card__transcript">
                  {recording.transcript}
                </p>
              ) : recording.status === "error" ? (
                <p className="voice-recorder__error">
                  {recording.error_message ?? "התמלול נכשל."}
                </p>
              ) : (
                <p className="muted">התמלול בתהליך…</p>
              )}
              {audioUrls[recording.id] ? (
                <audio
                  controls
                  autoPlay
                  preload="metadata"
                  src={audioUrls[recording.id]}
                />
              ) : null}
              <div className="recording-card__actions">
                {recording.storage_path && !audioUrls[recording.id] ? (
                  <button
                    className="text-button"
                    type="button"
                    disabled={busyId === recording.id}
                    onClick={() => void openAudio(recording.id)}
                  >
                    השמע
                  </button>
                ) : null}
                {recording.status === "error" && recording.storage_path ? (
                  <button
                    className="settings-action"
                    type="button"
                    disabled={busyId === recording.id}
                    onClick={() => void retry(recording.id)}
                  >
                    נסה לתמלל שוב
                  </button>
                ) : null}
                {recording.storage_path ? (
                  <button
                    className="text-button danger-text"
                    type="button"
                    disabled={busyId === recording.id}
                    onClick={() => void remove(recording.id, true)}
                  >
                    מחק אודיו
                  </button>
                ) : null}
                <button
                  className="text-button danger-text"
                  type="button"
                  disabled={busyId === recording.id}
                  onClick={() => void remove(recording.id, false)}
                >
                  מחק הכול
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
