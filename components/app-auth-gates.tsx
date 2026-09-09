"use client";
import { Action, AppState } from "@/lib/model";
import { resolveActiveTheme } from "@/lib/seasonal-theme";
import { ProfileForm } from "./profile-form";
import { SeasonalPublicShell } from "./seasonal-public-shell";

export function AppLoadingGate() {
  return (
    <SeasonalPublicShell>
      <main className="center" aria-busy="true">
        <div className="brand-mark">מ׳</div>
        <p>פותח את הבית שלך…</p>
      </main>
    </SeasonalPublicShell>
  );
}

export function AppChooseGate(props: { onStartLocal: () => void }) {
  return (
    <SeasonalPublicShell>
      <main className="welcome">
        <div className="brand-mark">מ׳</div>
        <p className="eyebrow">מה שכחתי?</p>
        <h1>צריך להתחבר כדי להמשיך.</h1>
        <a className="primary" href="/login">
          כניסה לחשבון
        </a>
        <button className="secondary" onClick={props.onStartLocal}>
          התנסות מקומית
        </button>
      </main>
    </SeasonalPublicShell>
  );
}

export function AppOnboardingGate(props: {
  profile: AppState["profile"];
  error: string;
  onSave: (a: Action) => Promise<void>;
  onSkip: () => void;
}) {
  const theme = resolveActiveTheme({
    mode: props.profile.themeMode ?? "auto",
    fixed: props.profile.fixedTheme ?? "spring",
    clock: new Date(),
    timezone: props.profile.timezone,
  });
  return (
    <SeasonalPublicShell theme={theme}>
      <main className="onboarding">
        <div className="brand-mark small">מ׳</div>
        <p className="eyebrow">היכרות קצרה</p>
        <h1>כל בית והקצב שלו.</h1>
        <p className="muted">
          כמה פרטים יעזרו לי להציע התחלה מתאימה. תמיד אפשר לשנות.
        </p>
        <section className="panel">
          <ProfileForm
            profile={props.profile}
            onboarding
            onSave={async (a) => {
              await props.onSave(a);
            }}
          />
        </section>
        <button className="text-button" onClick={props.onSkip}>
          אפשר גם להכיר בהמשך
        </button>
        {props.error && (
          <p className="error" role="alert">
            {props.error}
          </p>
        )}
      </main>
    </SeasonalPublicShell>
  );
}
