import {
  Sparkles,
  CalendarDays,
  Clock3,
  ChevronLeft,
  Leaf,
  CheckCheck,
} from "lucide-react";
import { AppState, Action, Task } from "@/lib/model";
import { getHomeTodayTasks } from "@/lib/domain/planning/home-today";
import { suggestions } from "@/lib/catalog";
import { TaskCard } from "@/components/task-card";
import { Empty } from "@/components/empty-state";
import type { AppView } from "@/components/view-header";

export function HomeView(props: {
  state: AppState;
  busy: boolean;
  clock: Date;
  detailed: boolean;
  greetingHour: string;
  onNavigate: (v: AppView) => void;
  onOpenPlan: () => void;
  onEdit: (t: Task) => void;
  onChat: (t: Task) => void;
  onComplete: (t: Task) => void;
  onAction: (a: Action) => Promise<void>;
  onNewTask: () => void;
}) {
  const { tasks: relevant, source } = getHomeTodayTasks(
    props.state,
    props.clock,
  );
  // Above-the-fold hint only for whatMatters fallback — never truncate DailyPlan.
  const shown = source === "daily_plan" ? relevant : relevant.slice(0, 6);
  return (
    <>
      <section className="greeting">
        <p className="eyebrow">הבית שלך, בקצב שלך</p>
        <h1>
          {+props.greetingHour < 12
            ? "בוקר טוב"
            : +props.greetingHour < 18
              ? "צהריים טובים"
              : "ערב טוב"}
          {props.state.profile.name ? `, ${props.state.profile.name}` : ""}
          <span className="greeting-dot">.</span>
        </h1>
        <p>מה יעזור לך עכשיו?</p>
      </section>
      <div className="engines">
        <button
          className="engine main-engine"
          onClick={() => props.onNavigate("focus")}
        >
          <span className="engine-icon">
            <Sparkles size={25} />
          </span>
          <span>
            <strong>מה שכחתי?</strong>
            <small>מה חשוב לזכור עכשיו</small>
          </span>
          <ChevronLeft size={21} />
        </button>
        <button className="engine" onClick={props.onOpenPlan}>
          <span className="engine-icon">
            <CalendarDays size={23} />
          </span>
          <span>
            <strong>מה שונה היום?</strong>
            <small>נעשה סדר ביום שלך</small>
          </span>
          <ChevronLeft size={21} />
        </button>
        <button className="engine" onClick={() => props.onNavigate("free")}>
          <span className="engine-icon">
            <Clock3 size={23} />
          </span>
          <span>
            <strong>יש לי זמן פנוי</strong>
            <small>מה מתאים לזמן ולכוח שלך</small>
          </span>
          <ChevronLeft size={21} />
        </button>
      </div>
      <section>
        <div className="section-heading">
          <h2>עכשיו אצלך</h2>
          <button
            className="text-button"
            onClick={() => props.onNavigate("tasks")}
          >
            לכל המשימות <ChevronLeft size={16} />
          </button>
        </div>
        {shown.length ? (
          <div className="task-list compact">
            {shown.map((t) => (
              <TaskCard
                state={props.state}
                busy={props.busy}
                clock={props.clock}
                detailed={false}
                compact
                onEdit={props.onEdit}
                onChat={props.onChat}
                onComplete={props.onComplete}
                onAction={props.onAction}
                key={t.id}
                task={t}
              />
            ))}
          </div>
        ) : (
          <Empty
            text="אפשר להניח כאן את הדבר הראשון שחשוב לזכור."
            action={props.onNewTask}
            label="הוספת משימה"
          />
        )}
      </section>
      {suggestions(props.state).length > 0 && (
        <button className="kit-invite" onClick={() => props.onNavigate("kit")}>
          <Leaf size={21} />
          <span>
            <strong>נכיר קצת את השגרה?</strong>
            <small>כמה הצעות שמתאימות לבית שלכם</small>
          </span>
          <ChevronLeft size={18} />
        </button>
      )}
      <button
        className="quiet-link"
        onClick={() => props.onNavigate("history")}
      >
        מה כבר נעשה <CheckCheck size={16} />
      </button>
    </>
  );
}
