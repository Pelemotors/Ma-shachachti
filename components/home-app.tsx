"use client";
import { useState, useEffect, useRef } from "react";
import {
  Home,
  MessageCircle,
  CheckCheck,
  ShoppingBasket,
  ArrowUp,
  SlidersHorizontal,
  Bell,
  BookOpen,
  Check,
  Undo2,
} from "lucide-react";
import { Task } from "@/lib/model";
import { resolveActiveTheme } from "@/lib/seasonal-theme";
import { useHousehold } from "@/lib/use-household";
import { useAppNavigation } from "@/lib/use-app-navigation";
import { VoiceButton } from "./voice-recorder";
import {
  AppLoadingGate,
  AppChooseGate,
  AppOnboardingGate,
} from "./app-auth-gates";
import { AppGlobalDialogs } from "./app-global-dialogs";
import { AppViewRouter } from "./app-view-router";
import { useProposalController } from "@/hooks/use-proposal-controller";
import { useChatController } from "@/hooks/use-chat-controller";
import { useTaskController } from "@/hooks/use-task-controller";
import { useDailyPlanController } from "@/hooks/use-daily-plan-controller";
import { useFreeTimeController } from "@/hooks/use-free-time-controller";
import { useShoppingController } from "@/hooks/use-shopping-controller";
import { useReminderController } from "@/hooks/use-reminder-controller";
import type { AppView } from "./view-header";

export function HomeApp() {
  const h = useHousehold();
  const { state, mode, busy } = h;
  const [view, setView] = useState<AppView>("home");
  const [clock, setClock] = useState(() => new Date());
  const chatBottom = useRef<HTMLDivElement>(null);
  const draftBox = useRef<HTMLTextAreaElement>(null);

  const tasks = useTaskController(h);
  const proposal = useProposalController(h, {
    mode,
    onRestored: () => setView("chat"),
  });
  const chat = useChatController(h, proposal);
  const free = useFreeTimeController({ state, clock });
  const plan = useDailyPlanController(h, {
    clock,
    defaultEffort: state.planning.today?.effort ?? 2,
    run: tasks.run,
    sendLock: chat.sendLock,
  });
  const shopping = useShoppingController(
    state.shopping,
    busy,
    tasks.run,
    tasks.act,
  );
  const reminders = useReminderController(h, { run: tasks.run });

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 60000);
    if (new URLSearchParams(window.location.search).get("view") === "reminders")
      setView("reminders");
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (view === "chat")
      chatBottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [
    view,
    state.messages,
    chat.isThinking,
    chat.proposal,
    chat.pendingUserMessage,
    chat.sendStatus,
  ]);

  useEffect(() => {
    if (!h.notice) return;
    const t = window.setTimeout(() => h.setNotice(""), 1800);
    return () => window.clearTimeout(t);
  }, [h.notice, h.setNotice]);

  const { navigate: navHistory } = useAppNavigation({
    view,
    homeView: "home",
    setView,
    enabled: mode === "cloud" || mode === "local",
  });

  const navigate = (v: AppView) => {
    navHistory(v);
    h.setNotice("");
  };

  const onTaskChat = (t: Task) => {
    chat.setContext(t.id);
    setView("chat");
  };

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "my-home-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const greeting = new Intl.DateTimeFormat("he-IL", {
    timeZone: state.profile.timezone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(clock);

  const activeTheme = resolveActiveTheme({
    mode: state.profile.themeMode ?? "auto",
    fixed: state.profile.fixedTheme ?? "spring",
    clock,
    timezone: state.profile.timezone,
  });

  if (mode === "loading") return <AppLoadingGate />;
  if (mode === "choose") return <AppChooseGate onStartLocal={h.startLocal} />;
  if (!state.profile.onboarded)
    return (
      <AppOnboardingGate
        profile={state.profile}
        error={h.error}
        onSave={async (a) => {
          await tasks.run([a], true);
        }}
        onSkip={() =>
          void tasks.act({
            type: "profile.update",
            patch: { onboarded: true },
          })
        }
      />
    );

  const taskCardHandlers = {
    onEdit: tasks.setEditor,
    onChat: onTaskChat,
    onComplete: tasks.openCompletion,
    onAction: tasks.act,
  };

  return (
    <div className="app-shell" data-theme={activeTheme}>
      <aside className="desktop-sidebar">
        <div className="wordmark">
          <span className="brand-mark small">מ׳</span>
          <strong>מה שכחתי?</strong>
        </div>
        <p className="muted">בקצב של הבית שלך</p>
        <nav aria-label="ניווט ראשי">
          {(
            [
              ["home", Home, "הבית שלי"],
              ["chat", MessageCircle, "שיחה"],
              ["tasks", CheckCheck, "משימות"],
              ["shopping", ShoppingBasket, "קניות"],
              ["reminders", Bell, "תזכורות"],
              ["memory", BookOpen, "הזיכרון שלי"],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              className={view === v ? "selected" : ""}
              onClick={() => navigate(v)}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => navigate("settings")}>
            <SlidersHorizontal size={18} />
            הבית וההעדפות
          </button>
          <span>פחות להחזיק בראש.</span>
        </div>
      </aside>
      <div className="main-column">
        <header className="app-header">
          <div className="mobile-brand">
            <span className="brand-mark small">מ׳</span>
            <strong>מה שכחתי?</strong>
          </div>
          <span className="desktop-date">
            {new Intl.DateTimeFormat("he-IL", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: state.profile.timezone,
            }).format(clock)}
          </span>
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label="תזכורות"
              onClick={() => navigate("reminders")}
            >
              <Bell size={20} />
            </button>
            <button
              className="avatar"
              aria-label="הגדרות הבית"
              onClick={() => navigate("settings")}
            >
              {state.profile.name?.[0] ?? "מ"}
            </button>
          </div>
        </header>
        {mode === "local" && (
          <div className="demo-banner">
            הדגמה במכשיר הזה · הנתונים מקומיים והשיחה בסיסית
          </div>
        )}
        <main
          className={
            view === "chat" ? "main-content chat-page" : "main-content"
          }
        >
          {h.error && (
            <div className="error-banner" role="alert">
              <span>{h.error}</span>
              <button
                onClick={() => {
                  chat.clearError();
                  if (mode === "cloud")
                    void h.cloudLoad().catch((e) => h.setError(e.message));
                }}
              >
                טעינה מחדש
              </button>
            </div>
          )}
          <AppViewRouter
            view={view}
            state={state}
            busy={busy}
            mode={mode}
            clock={clock}
            greetingHour={greeting}
            revision={h.currentRevision()}
            tasks={tasks}
            chat={chat}
            free={free}
            plan={plan}
            shopping={shopping}
            reminders={reminders}
            chatBottomRef={chatBottom}
            taskCardHandlers={taskCardHandlers}
            navigate={navigate}
            onNotice={h.setNotice}
            onError={h.setError}
            onExport={exportData}
            onSignOut={() => void h.signOut()}
          />
        </main>

        {h.notice && (
          <div className="save-notice" role="status">
            <Check size={16} />
            <span>{h.notice}</span>
            {h.undo && (
              <button disabled={busy} onClick={() => void h.restore()}>
                <Undo2 size={15} />
                ביטול
              </button>
            )}
            <button aria-label="סגירת הודעה" onClick={() => h.setNotice("")}>
              ×
            </button>
          </div>
        )}

        {(view === "home" || view === "chat") && (
          <div className="composer-wrap">
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                if (view === "home") {
                  setView("chat");
                  return;
                }
                void chat.sendMessage();
              }}
            >
              <VoiceButton
                enabled={mode === "cloud" && !chat.isThinking && !busy}
                aiConsent={state.profile.aiConsent}
                onNeedConsent={() => navigate("settings")}
                disabledHint={
                  mode !== "cloud"
                    ? "תמלול קולי זמין אחרי חיבור לחשבון. אפשר להקליד כאן."
                    : "תמלול קולי זמין אחרי הפעלת עזרה אישית. אפשר להקליד כאן."
                }
                onText={(text) => {
                  chat.setDraft((prev) => (prev ? prev + " " + text : text));
                  setView("chat");
                  draftBox.current?.focus();
                }}
                onError={h.setError}
              />
              <textarea
                ref={draftBox}
                aria-label="הודעה לסוכן"
                rows={1}
                maxLength={6000}
                placeholder="כתבו לי מה קורה…"
                value={chat.draft}
                onFocus={() => {
                  if (view === "home") setView("chat");
                }}
                onChange={(e) => chat.setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    if (view === "home") setView("chat");
                    else void chat.sendMessage();
                  }
                }}
              />
              <button
                className="send"
                aria-label="שליחת הודעה"
                disabled={
                  !chat.draft.trim() ||
                  chat.isThinking ||
                  busy ||
                  !!chat.proposal
                }
              >
                <ArrowUp size={21} />
              </button>
            </form>
            <small>
              {view === "chat"
                ? "אפשר לערוך תמלול לפני השליחה · Shift + Enter לשורה חדשה"
                : "אפשר לכתוב, לדבר או פשוט לפרוק מהראש"}
            </small>
          </div>
        )}

        <nav className="mobile-nav" aria-label="ניווט בתחתית">
          {(
            [
              ["home", Home, "בית"],
              ["chat", MessageCircle, "שיחה"],
              ["tasks", CheckCheck, "משימות"],
              ["shopping", ShoppingBasket, "קניות"],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              className={view === v ? "selected" : ""}
              onClick={() => navigate(v)}
            >
              <Icon size={21} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <AppGlobalDialogs
        state={state}
        busy={busy}
        editor={tasks.editor}
        completion={tasks.completion}
        workActual={tasks.workActual}
        confirm={tasks.confirm}
        lifeAdminPrompt={tasks.lifeAdminPrompt}
        onCloseEditor={() => tasks.setEditor(null)}
        onSaveEditor={async (a) => {
          await tasks.run([a]);
        }}
        onCloseCompletion={() => tasks.setCompletion(null)}
        onWorkActual={tasks.setWorkActual}
        onSubmitCompletion={() => void tasks.submitCompletion()}
        onCloseConfirm={() => tasks.setConfirm(null)}
        onSubmitConfirm={() => void tasks.confirmActions()}
        onCloseLifeAdminPrompt={() => tasks.setLifeAdminPrompt(null)}
        onLifeAdminResponse={(response) =>
          void tasks.submitLifeAdminResponse(response)
        }
      />
    </div>
  );
}
