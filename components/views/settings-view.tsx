"use client";
import { useState } from "react";
import {
  BookOpen,
  Leaf,
  CheckCheck,
  Download,
  Bell,
  Trash2,
  LogOut,
  ChevronLeft,
} from "lucide-react";
import { Action, AppState } from "@/lib/model";
import { ProfileForm } from "@/components/profile-form";
import { ViewHeader } from "@/components/view-header";
import type { AppView } from "@/components/view-header";
import { DevicePermissionsPanel } from "@/components/device-permissions-panel";

export function SettingsView(props: {
  state: AppState;
  mode: string;
  pushBusy: boolean;
  pushEnabled: boolean;
  pushReady?: boolean;
  run: (actions: Action[], confirmed?: boolean) => Promise<void>;
  onNavigate: (v: AppView) => void;
  onExport: () => void;
  onEnablePush: () => void;
  onDisablePush: () => void;
  onClearHistory: () => void;
  onSignOut: () => void;
}) {
  const [memberName, setMemberName] = useState("");
  const [memberType, setMemberType] = useState<
    "adult" | "child" | "pet" | "other"
  >("adult");

  return (
    <>
      <ViewHeader view="settings" />
      <section className="panel">
        <ProfileForm
          profile={props.state.profile}
          onSave={async (a) => {
            await props.run([a], true);
          }}
        />
      </section>
      <section className="panel stack">
        <h3>אנשים וחיות בבית</h3>
        <p className="muted">
          אופציונלי — כדי לקשר משימות כמו תורים או טיפול למישהו ספציפי.
        </p>
        {props.state.members.map((m) => (
          <div className="list-row" key={m.id}>
            <span>
              {m.name}
              <span className="muted">
                {" "}
                ·{" "}
                {m.type === "adult"
                  ? "מבוגר/ת"
                  : m.type === "child"
                    ? "ילד/ה"
                    : m.type === "pet"
                      ? "חיית מחמד"
                      : "אחר"}
              </span>
            </span>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                void props.run([{ type: "member.remove", id: m.id }], true)
              }
            >
              הסרה
            </button>
          </div>
        ))}
        <label>
          שם
          <input
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            maxLength={80}
            aria-label="שם בן או בת בית"
          />
        </label>
        <label>
          סוג
          <select
            value={memberType}
            onChange={(e) => setMemberType(e.target.value as typeof memberType)}
            aria-label="סוג בן או בת בית"
          >
            <option value="adult">מבוגר/ת</option>
            <option value="child">ילד/ה</option>
            <option value="pet">חיית מחמד</option>
            <option value="other">אחר</option>
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          disabled={!memberName.trim()}
          onClick={() => {
            const name = memberName.trim();
            if (!name) return;
            void props.run(
              [
                {
                  type: "member.upsert",
                  member: { name, type: memberType, aliases: [] },
                },
              ],
              true,
            );
            setMemberName("");
          }}
        >
          הוספה
        </button>
      </section>
      <DevicePermissionsPanel
        mode={props.mode}
        pushEnabled={props.pushEnabled}
        pushBusy={props.pushBusy}
        pushReady={props.pushReady}
        onEnablePush={props.onEnablePush}
      />
      <div className="settings-links">
        <button onClick={() => props.onNavigate("memory")}>
          <BookOpen size={20} />
          המידע שנשמר על הבית
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => props.onNavigate("kit")}>
          <Leaf size={20} />
          הצעות והרגלים
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => props.onNavigate("history")}>
          <CheckCheck size={20} />
          היסטוריית משימות
          <ChevronLeft size={18} />
        </button>
        <button onClick={props.onExport}>
          <Download size={20} />
          הורדת גיבוי אישי
        </button>
        <button
          onClick={() => {
            location.href = "/app/backup";
          }}
        >
          <Download size={20} />
          שחזור גיבוי
        </button>
        {props.mode === "cloud" && props.pushEnabled && (
          <button disabled={props.pushBusy} onClick={props.onDisablePush}>
            <Bell size={20} />
            כיבוי התראות במכשיר
          </button>
        )}
        <button onClick={props.onClearHistory}>
          <Trash2 size={20} />
          מחיקת השיחות והיסטוריית הפעולות
        </button>
        <button onClick={props.onSignOut}>
          <LogOut size={20} />
          {props.mode === "local" ? "יציאה מההדגמה" : "יציאה מהחשבון"}
        </button>
      </div>
      <p className="muted">
        הקלטות קול נשלחות לתמלול ולא נשמרות באפליקציה. ההיסטוריה מוגבלת ל־200
        הודעות אחרונות. גיבוי עשוי לכלול מידע אישי — שמרו אותו אצלכם.
      </p>
    </>
  );
}
