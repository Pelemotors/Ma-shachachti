"use client";
import { useState } from "react";
import { Profile, Action } from "@/lib/model";
export function ProfileForm({
  profile,
  onSave,
  onboarding = false,
}: {
  profile: Profile;
  onSave: (a: Action) => Promise<void>;
  onboarding?: boolean;
}) {
  const [p, setP] = useState(profile),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const patch = (x: Partial<Profile>) => setP({ ...p, ...x });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({
        type: "profile.update",
        patch: { ...p, onboarded: true },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "לא נשמר");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="stack" onSubmit={save}>
      <label>
        איך לקרוא לך?
        <input
          maxLength={80}
          value={p.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="שם פרטי, אם מתאים"
        />
      </label>
      <div className="form-grid">
        <label>
          פנייה
          <select
            value={p.addressAs}
            onChange={(e) =>
              patch({ addressAs: e.target.value as Profile["addressAs"] })
            }
          >
            <option value="feminine">בלשון נקבה</option>
            <option value="masculine">בלשון זכר</option>
            <option value="neutral">ללא פנייה מגדרית</option>
          </select>
        </label>
        <label>
          ילדים בבית
          <input
            type="number"
            min={0}
            max={20}
            value={p.children}
            onChange={(e) => patch({ children: +e.target.value })}
          />
        </label>
        <label>
          חדרים
          <input
            type="number"
            min={1}
            max={30}
            value={p.rooms}
            onChange={(e) => patch({ rooms: +e.target.value })}
          />
        </label>
        <label>
          חדרי רחצה
          <input
            type="number"
            min={1}
            max={15}
            value={p.bathrooms}
            onChange={(e) => patch({ bathrooms: +e.target.value })}
          />
        </label>
      </div>
      <fieldset>
        <legend>מה יש אצלכם?</legend>
        <div className="feature-checks">
          {(
            [
              ["garden", "גינה או חצר"],
              ["pets", "חיית מחמד"],
              ["car", "רכב"],
              ["dishwasher", "מדיח"],
              ["dryer", "מייבש"],
            ] as const
          ).map(([key, label]) => (
            <label className="check-line" key={key}>
              <input
                type="checkbox"
                checked={p[key]}
                onChange={(e) => patch({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="consent">
        <label className="check-line">
          <input
            type="checkbox"
            checked={p.aiConsent}
            onChange={(e) => patch({ aiConsent: e.target.checked })}
          />
          <strong>עזרה אישית בעזרת AI</strong>
        </label>
        <p>
          מאפשרת לשלוח לשירות ה־AI את השיחה ומידע רלוונטי מהבית לצורך הבנה
          והצעות. אפשר לכבות בכל רגע. גם בלי זה אפשר לנהל משימות ולבנות תוכנית.
        </p>
      </div>
      {!onboarding && (
        <>
          <label className="check-line">
            <input
              type="checkbox"
              checked={p.autoApply}
              onChange={(e) => patch({ autoApply: e.target.checked })}
            />
            שמירה אוטומטית של פעולות פשוטות והפיכות מהשיחה
          </label>
          <small>הסרת מידע, ביטול ומשימות רבות יחד תמיד יוצגו לאישור.</small>
          <label>
            אזור זמן
            <input
              required
              value={p.timezone}
              onChange={(e) => patch({ timezone: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label>
              שקט החל משעה
              <input
                type="number"
                min={0}
                max={23}
                value={p.quietStart}
                onChange={(e) => patch({ quietStart: +e.target.value })}
              />
            </label>
            <label>
              עד שעה
              <input
                type="number"
                min={0}
                max={23}
                value={p.quietEnd}
                onChange={(e) => patch({ quietEnd: +e.target.value })}
              />
            </label>
          </div>
          <small>
            תזכורות שנופלות בשעות השקט ממתינות לסיומן. שעות זהות מבטלות את חלון
            השקט.
          </small>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button disabled={busy} className="primary">
        {busy ? "שומר…" : onboarding ? "אפשר להתחיל" : "שמירת העדפות"}
      </button>
    </form>
  );
}
