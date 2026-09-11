"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import { FIXED_TIME_LABEL } from "@/lib/schedule";
import { addJerusalemDays, formatClockRange, formatJerusalemDay, todayContext } from "@/lib/time";
import type { TaskRow } from "@/lib/types";

type Timed = TaskRow & { start: string; end: string | null; fixed: boolean };

export function MySchedule(props: {
  date: string;
  onDateChange: (date: string) => void;
  saving?: boolean;
  onToggle: (id: string, done: boolean) => Promise<boolean>;
}) {
  const today = todayContext().date;
  const [timed, setTimed] = useState<Timed[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setTimed([]);
    setError("");
    setLoading(true);
    void authFetch(`/api/schedule?date=${props.date}`)
      .then((response) => response.json())
      .then((body) => {
        if (!alive) return;
        if (typeof body.date === "string" && body.date !== props.date) return;
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
  }, [props.date, props.saving]);

  return (
    <div className="my-schedule">
      <div className="schedule-nav">
        <button type="button" onClick={() => props.onDateChange(addJerusalemDays(props.date, -1))}>
          ‹ יום קודם
        </button>
        <strong>
          {props.date === today ? "היום" : ""} {formatJerusalemDay(props.date, "long")}
        </strong>
        <button type="button" onClick={() => props.onDateChange(addJerusalemDays(props.date, 1))}>
          יום הבא ›
        </button>
      </div>
      {props.date !== today ? (
        <button className="text-button" type="button" onClick={() => props.onDateChange(today)}>
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
                onClick={() => {
                  const snapshot = timed;
                  setTimed((current) =>
                    current.map((task) =>
                      task.id === item.id
                        ? { ...task, status: done ? "open" : "done" }
                        : task,
                    ),
                  );
                  void props.onToggle(item.id, done).then((ok) => {
                    if (!ok) setTimed(snapshot);
                  });
                }}
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
