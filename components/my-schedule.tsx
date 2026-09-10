"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
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
  const [throughout, setThroughout] = useState<TaskRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void authFetch(`/api/schedule?date=${date}`)
      .then((response) => response.json())
      .then((body) => {
        if (!alive) return;
        if (!Array.isArray(body.timed)) {
          setError("לא הצלחנו לטעון את הלוז.");
          return;
        }
        setTimed(body.timed);
        setThroughout(body.throughout ?? []);
        setError("");
      })
      .catch(() => {
        if (alive) setError("לא הצלחנו לטעון את הלוז.");
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
                {item.fixed ? <em>קבוע</em> : null}
              </div>
            </li>
          );
        })}
      </ul>
      {throughout.length ? (
        <section>
          <h2>במהלך היום</h2>
          <ul className="schedule-plan-list">
            {throughout.map((task) => {
              const done = task.status !== "open";
              return (
                <li key={task.id} className={done ? "done" : undefined}>
                  <button
                    className={`task-check${done ? " checked" : ""}`}
                    type="button"
                    disabled={props.saving}
                    onClick={() => props.onToggle(task.id, done)}
                  />
                  <div className="task-copy">
                    <span>{task.title}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {!timed.length && !throughout.length ? (
        <p className="muted">אין שיבוץ ליום הזה.</p>
      ) : null}
    </div>
  );
}
