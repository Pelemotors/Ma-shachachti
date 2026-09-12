"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AdminIncidentsResponse,
  OperationalEvent,
} from "@/lib/admin-control-contract";

type EventFilter =
  | "all"
  | "errors"
  | "warnings"
  | "ai"
  | "reminders"
  | "auth"
  | "database"
  | "system";

const filters: Array<[EventFilter, string]> = [
  ["all", "הכול"],
  ["errors", "שגיאות"],
  ["warnings", "אזהרות"],
  ["ai", "AI"],
  ["reminders", "תזכורות"],
  ["auth", "Auth"],
  ["database", "Database"],
  ["system", "System"],
];

export function OperationalEventsPanel({
  events,
  incidents,
  updatedAt,
  refreshing,
  onRefresh,
  onSelect,
}: {
  events: OperationalEvent[];
  incidents: AdminIncidentsResponse | null;
  updatedAt: string;
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (event: OperationalEvent) => void;
}) {
  const [filter, setFilter] = useState<EventFilter>("all");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const eventType = new URLSearchParams(window.location.search).get("type");
    if (eventType) setQuery(eventType);
  }, []);
  const grouped = useMemo(() => {
    const groups = new Map<
      string,
      { latest: OperationalEvent; count: number }
    >();
    for (const event of events) {
      const current = groups.get(event.event_type);
      if (current) current.count += 1;
      else groups.set(event.event_type, { latest: event, count: 1 });
    }
    return [...groups.values()].filter(({ latest }) => {
      const subsystem = eventSubsystem(latest.event_type);
      const severity = eventSeverity(latest.event_type);
      const filterMatches =
        filter === "all" ||
        filter === subsystem ||
        (filter === "errors" && severity === "error") ||
        (filter === "warnings" && severity === "warning");
      const searchMatches =
        `${latest.event_type} ${eventTitle(latest.event_type)}`
          .toLowerCase()
          .includes(query.trim().toLowerCase());
      return filterMatches && searchMatches;
    });
  }, [events, filter, query]);

  return (
    <section className="smith-card smith-observations operational-events">
      <div className="smith-panel-heading">
        <div>
          <h2>אירועים ותקלות אחרונות</h2>
          <p>טלמטריה אמיתית מ־activity_events; לא ממצאי Smith.</p>
        </div>
        <div className="section-freshness">
          <time>{new Date(updatedAt).toLocaleString("he-IL")}</time>
          <button onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "מרענן…" : "רענון"}
          </button>
        </div>
      </div>
      <div className="event-controls">
        <div className="event-filters" aria-label="סינון אירועים">
          {filters.map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="חיפוש לפי סוג אירוע…"
          aria-label="חיפוש באירועים"
        />
      </div>
      {grouped.length ? (
        <div className="operational-event-list">
          {grouped.map(({ latest, count }) => {
            const severity = eventSeverity(latest.event_type);
            const incident = incidents?.incidents.find(
              (item) => item.eventType === latest.event_type,
            );
            return (
              <button
                key={latest.event_type}
                data-severity={severity}
                onClick={() => onSelect(latest)}
              >
                <time>
                  {new Date(latest.created_at).toLocaleString("he-IL")}
                </time>
                <span className="event-system">
                  {subsystemLabel(latest.event_type)}
                </span>
                <span>
                  <strong>{eventTitle(latest.event_type)}</strong>
                  <small dir="ltr">{latest.event_type}</small>
                </span>
                {count > 1 && <b className="event-repeat">{count}×</b>}
                <em
                  data-state={
                    incident?.status ?? eventStatus(latest.event_type)
                  }
                >
                  {incident
                    ? incident.status === "resolved"
                      ? "נפתר"
                      : "לא נפתר"
                    : eventStatus(latest.event_type) === "success"
                      ? "הצלחה"
                      : "מתועד"}
                </em>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="smith-empty">אין אירועים שתואמים לסינון.</p>
      )}
    </section>
  );
}

function eventSubsystem(eventType: string): EventFilter {
  if (eventType.startsWith("ai.")) return "ai";
  if (eventType.startsWith("cron.reminders.")) return "reminders";
  if (eventType.startsWith("push.")) return "system";
  if (eventType.startsWith("auth.")) return "auth";
  if (eventType.startsWith("database.")) return "database";
  return "system";
}

function subsystemLabel(eventType: string) {
  const subsystem = eventSubsystem(eventType);
  return {
    ai: "AI",
    reminders: "Reminders",
    auth: "Auth",
    database: "Database",
    system: "System",
    all: "System",
    errors: "System",
    warnings: "System",
  }[subsystem];
}

function eventSeverity(eventType: string): "error" | "warning" | "info" {
  if (eventType.includes("failure")) return "error";
  if (eventType.includes("warning")) return "warning";
  return "info";
}

function eventStatus(eventType: string) {
  return eventType.includes("success") || eventType === "push.test"
    ? "success"
    : "recorded";
}

function eventTitle(eventType: string) {
  const titles: Record<string, string> = {
    "ai.success": "קריאת AI הצליחה",
    "ai.failure": "קריאת AI נכשלה",
    "cron.reminders.success": "ריצת תזכורות הצליחה",
    "cron.reminders.failure": "ריצת תזכורות נכשלה",
    "cron.recordings.success": "ניקוי הקלטות הצליח",
    "cron.recordings.failure": "ניקוי הקלטות נכשל",
    "admin.access.changed": "הרשאת משתמש עודכנה",
    "push.test": "בדיקת Push הצליחה",
    "push.test.failure": "בדיקת Push נכשלה",
  };
  return titles[eventType] ?? "אירוע מערכת";
}
