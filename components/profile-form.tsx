"use client";
import { useState, type CSSProperties } from "react";
import { Profile, Action } from "@/lib/model";
import {
  SEASON_THEMES,
  THEME_LABELS,
  THEME_TOKENS,
  themeBackgroundUrl,
  type SeasonTheme,
  type ThemeMode,
} from "@/lib/theme-config";

const THEME_MODE_OPTIONS: {
  mode: ThemeMode;
  title: string;
  description: string;
}[] = [
  {
    mode: "auto",
    title: "מתחלף",
    description: "העיצוב משתנה אוטומטית לפי עונות השנה",
  },
  {
    mode: "fixed",
    title: "קבוע",
    description: "אני רוצה להשאיר עיצוב אחד קבוע",
  },
];

const SEASON_EMOJIS: Record<SeasonTheme, string> = {
  spring: "🌿",
  summer: "☀️",
  autumn: "🍂",
  winter: "❄️",
};
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
      const cleaner = p.cleaner?.enabled
        ? {
            enabled: true,
            visitsPerWeek: Math.max(1, p.cleaner.visitsPerWeek || 1),
            days: p.cleaner.days ?? [],
          }
        : { enabled: false, visitsPerWeek: 0, days: [] as number[] };
      await onSave({
        type: "profile.update",
        patch: {
          ...p,
          cleaner,
          householdRoutines: {
            cleaningDays: p.householdRoutines?.cleaningDays ?? [],
          },
          themeMode: p.themeMode ?? "auto",
          fixedTheme: p.fixedTheme ?? "spring",
          onboarded: true,
        },
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
      <fieldset>
        <legend>ימי ניקיון בבית</legend>
        <div className="feature-checks">
          {(
            [
              [0, "א׳"],
              [1, "ב׳"],
              [2, "ג׳"],
              [3, "ד׳"],
              [4, "ה׳"],
              [5, "ו׳"],
              [6, "ש׳"],
            ] as const
          ).map(([day, label]) => {
            const checked = (p.householdRoutines?.cleaningDays ?? []).includes(
              day,
            );
            return (
              <label className="check-line" key={day}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const cur = p.householdRoutines?.cleaningDays ?? [];
                    patch({
                      householdRoutines: {
                        cleaningDays: e.target.checked
                          ? [...cur, day]
                          : cur.filter((d) => d !== day),
                      },
                    });
                  }}
                />
                {label}
              </label>
            );
          })}
        </div>
        <small>בונוס עדין בלו״ז לימי ניקיון — לא מחליף דדליין.</small>
      </fieldset>
      <fieldset>
        <legend>מנקה בבית</legend>
        <label className="check-line">
          <input
            type="checkbox"
            checked={p.cleaner?.enabled ?? false}
            onChange={(e) =>
              patch({
                cleaner: e.target.checked
                  ? {
                      enabled: true,
                      visitsPerWeek: Math.max(1, p.cleaner?.visitsPerWeek || 1),
                      days: p.cleaner?.days ?? [],
                    }
                  : { enabled: false, visitsPerWeek: 0, days: [] },
              })
            }
          />
          יש מנקה קבוע
        </label>
        {(p.cleaner?.enabled ?? false) && (
          <>
            <label>
              ביקורים בשבוע
              <input
                type="number"
                min={1}
                max={7}
                value={p.cleaner?.visitsPerWeek || 1}
                onChange={(e) =>
                  patch({
                    cleaner: {
                      enabled: true,
                      visitsPerWeek: Math.max(1, +e.target.value || 1),
                      days: p.cleaner?.days ?? [],
                    },
                  })
                }
              />
            </label>
            <div className="feature-checks">
              {(
                [
                  [0, "א׳"],
                  [1, "ב׳"],
                  [2, "ג׳"],
                  [3, "ד׳"],
                  [4, "ה׳"],
                  [5, "ו׳"],
                  [6, "ש׳"],
                ] as const
              ).map(([day, label]) => {
                const checked = (p.cleaner?.days ?? []).includes(day);
                return (
                  <label className="check-line" key={`c-${day}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const cur = p.cleaner?.days ?? [];
                        patch({
                          cleaner: {
                            enabled: true,
                            visitsPerWeek: Math.max(
                              1,
                              p.cleaner?.visitsPerWeek || 1,
                            ),
                            days: e.target.checked
                              ? [...cur, day]
                              : cur.filter((d) => d !== day),
                          },
                        });
                      }}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
            <small>
              בימי מנקה משימות כבדות שעשויות להתאים למנקה מקבלות עדיפות נמוכה —
              בלי סימון אוטומטי כבוצע.
            </small>
          </>
        )}
      </fieldset>
      {!onboarding && (
        <>
          <fieldset className="stack theme-settings">
            <legend>עיצוב האפליקציה</legend>
            <div
              className="theme-mode-options"
              role="radiogroup"
              aria-label="מצב עיצוב"
            >
              {THEME_MODE_OPTIONS.map((opt) => {
                const selected = (p.themeMode ?? "auto") === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={
                      "theme-mode-option" + (selected ? " is-selected" : "")
                    }
                    onClick={() => patch({ themeMode: opt.mode })}
                  >
                    <strong>{opt.title}</strong>
                    <span>{opt.description}</span>
                  </button>
                );
              })}
            </div>
            {(p.themeMode ?? "auto") === "fixed" && (
              <div
                className="theme-season-grid"
                role="radiogroup"
                aria-label="עונה קבועה"
              >
                {SEASON_THEMES.map((theme) => {
                  const selected = (p.fixedTheme ?? "spring") === theme;
                  const tokens = THEME_TOKENS[theme];
                  return (
                    <button
                      key={theme}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={
                        "theme-season-card" + (selected ? " is-selected" : "")
                      }
                      style={
                        {
                          "--season-primary": tokens.primary,
                          "--season-bg": `url(${themeBackgroundUrl(theme)})`,
                        } as CSSProperties
                      }
                      onClick={() => patch({ fixedTheme: theme })}
                    >
                      <span className="theme-season-preview" aria-hidden="true" />
                      <span className="theme-season-meta">
                        <span className="theme-season-emoji" aria-hidden="true">
                          {SEASON_EMOJIS[theme]}
                        </span>
                        <strong>{THEME_LABELS[theme]}</strong>
                        <span
                          className="theme-season-swatch"
                          aria-hidden="true"
                        />
                      </span>
                      {selected ? (
                        <span className="theme-season-check" aria-hidden="true">
                          ✓
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
            <small>
              במצב מתחלף הצבעים משתנים לפי החודש באזור הזמן של הבית. במצב קבוע
              נשארת העונה שבחרת.
            </small>
          </fieldset>
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
