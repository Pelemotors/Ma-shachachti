"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import { FIXED_TIME_LABEL } from "@/lib/schedule";
import { addJerusalemDays, formatClockRange, formatJerusalemDay, todayContext } from "@/lib/time";
import type { TaskRow } from "@/lib/types";

type Timed = TaskRow & { start: string; end: string | null; fixed: boolean };

export function MySchedule(props: {
  saving?: boolean;
  onToggle: (id: string, done: boolean) => void;
}) {
  const today = todayContext().date;
  const [date, setDate] = useState(today);
  const [timed, setTimed] = useState<Timed[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setTimed([]);
    setError("");
    setLoading(true);
    void authFetch(`/api/schedule?date=${date}`)
      .then((response) => response.json())
      .then((body) => {
        if (!alive) return;
        if (typeof body.date === "string" && body.date !== date) return;
        if (!Array.isArray(body.timed)) {
          setError("לא הצלחנו לטעון את הלוז.");
          setLoading(false);
          return;
        }
        setTimed(body.timed);
        setError("");
        setLoading(false);
      })
      .catch(() => {
        if (alive) {
          setError("לא הצלחנו לטעון את הלוז.");
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [date, props.saving]);

  return (
    <div className="my-schedule">
      <div className="schedule-nav">
        <button type="button" onClick={() => setDate(addJerusalemDays(date, -1))}>
          ‹ יום קודם
        </button>
        <strong>
          {date === today ? "היום" : ""} {formatJerusalemDay(date, "long")}
        </strong>
        <button type="button" onClick={() => setDate(addJerusalemDays(date, 1))}>
          יום הבא ›
        </button>
      </div>
      {date !== today ? (
        <button className="text-button" type="button" onClick={() => setDate(today)}>
          חזרה להיום
        </button>
      ) : null}
      {error ? <p className="error-box">{error}</p> : null}
      <ul className="schedule-plan-list">
        {timed.map((item) => {
          const done = item.status !== "open";
          return (
            <li key={item.id} className={done ? "done" : undefined}>
              <button
                className={`task-check${done ? " checked" : ""}`}
                type="button"
                disabled={props.saving}
                onClick={() => props.onToggle(item.id, done)}
              />
              <div className="task-copy">
                <small className="schedule-time">
                  {formatClockRange(item.start, item.end)}
                </small>
                <span>{item.title}</span>
                {item.fixed ? <em>{FIXED_TIME_LABEL}</em> : null}
              </div>
            </li>
          );
        })}
      </ul>
      {!loading && !timed.length && !error ? (
        <p className="muted">אין משימות משובצות בלו״ז ליום הזה.</p>
      ) : null}
    </div>
  );
}
