"use client";

import { useState } from "react";
import { StateSchema, type AppState } from "@/lib/model";
import { useHousehold } from "@/lib/use-household";
import { SeasonalPublicShell } from "@/components/seasonal-public-shell";

export default function BackupPage() {
  const h = useHousehold();
  const [candidate, setCandidate] = useState<AppState | null>(null);
  const [message, setMessage] = useState("");

  async function read(file: File | null) {
    setCandidate(null);
    setMessage("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessage("הגיבוי גדול מדי.");
      return;
    }
    try {
      const parsed = StateSchema.parse(JSON.parse(await file.text()));
      setCandidate(parsed);
    } catch {
      setMessage("הקובץ אינו גיבוי תקין של מה שכחתי?.");
    }
  }

  if (h.mode === "loading")
    return (
      <SeasonalPublicShell>
        <main className="welcome" aria-busy="true">
          <h1>טוען גיבוי…</h1>
        </main>
      </SeasonalPublicShell>
    );

  if (h.mode === "choose")
    return (
      <SeasonalPublicShell>
        <main className="welcome">
          <p className="eyebrow">מה שכחתי?</p>
          <h1>שחזור גיבוי</h1>
          <p>
            יש להתחבר לחשבון או לפתוח את ההדגמה המקומית שאליה רוצים לשחזר.
          </p>
          <a
            className="primary"
            href={`/login?returnTo=${encodeURIComponent("/app/backup")}`}
          >
            כניסה לחשבון
          </a>
          <button className="secondary" onClick={h.startLocal}>
            פתיחת ההדגמה המקומית
          </button>
        </main>
      </SeasonalPublicShell>
    );

  return (
    <SeasonalPublicShell>
      <main className="welcome">
        <p className="eyebrow">גיבוי אישי</p>
        <h1>שחזור גיבוי</h1>
        <p>הקובץ נבדק לפני החלפה. שום דבר לא משתנה עד לאישור הסופי.</p>
        <section className="panel stack">
          <label>
            בחירת קובץ JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => void read(e.target.files?.[0] ?? null)}
            />
          </label>
          {candidate && (
            <div role="status">
              <h2>תצוגה מקדימה</h2>
              <p>
                {candidate.tasks.length} משימות · {candidate.facts.length} פרטי
                זיכרון · {candidate.shopping.length} רשומות קניות ·{" "}
                {candidate.reminders.length} תזכורות ·{" "}
                {candidate.messages.length} הודעות
              </p>
              <p>
                השחזור יחליף את המצב הנוכחי ב־
                {h.mode === "cloud" ? "חשבון הענן" : "הדגמה המקומית"}.
              </p>
              <button
                className="primary"
                disabled={h.busy}
                onClick={async () => {
                  if (!candidate) return;
                  if (
                    !window.confirm(
                      "להחליף את המידע הנוכחי בגיבוי הזה? הפעולה תתבצע רק אם גרסת הענן לא השתנתה.",
                    )
                  )
                    return;
                  try {
                    await h.replaceState(candidate);
                    setMessage("השחזור הושלם בהצלחה.");
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : "השחזור נכשל.");
                  }
                }}
              >
                {h.busy ? "משחזר…" : "אישור ושחזור"}
              </button>
            </div>
          )}
          {(message || h.error) && (
            <p
              role="alert"
              className={message.includes("הושלם") ? "muted" : "error"}
            >
              {message || h.error}
            </p>
          )}
          <a className="text-button" href="/app">
            חזרה לאפליקציה
          </a>
        </section>
      </main>
    </SeasonalPublicShell>
  );
}
