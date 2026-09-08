import { Plus, Search } from "lucide-react";
import { Action, AppState, Task } from "@/lib/model";
import { TASK_CATEGORIES } from "@/lib/taxonomy";
import { getActiveTasksForList, isActiveVisibleTask } from "@/lib/domain/tasks";
import { ViewHeader } from "@/components/view-header";
import { TaskCard } from "@/components/task-card";
import { Empty } from "@/components/empty-state";
import type { AppView } from "@/components/view-header";

export function TasksView(props: {
  state: AppState;
  busy: boolean;
  clock: Date;
  filter: string;
  category: string;
  detailed: boolean;
  matches: (t: Task) => boolean;
  onFilter: (v: string) => void;
  onCategory: (v: string) => void;
  onDetailed: (v: boolean) => void;
  onNavigate: (v: AppView) => void;
  onEdit: (t: Task) => void;
  onChat: (t: Task) => void;
  onComplete: (t: Task) => void;
  onAction: (a: Action) => Promise<void>;
  onNewTask: () => void;
}) {
  return (
    <>
      <ViewHeader view="tasks">
        <button className="primary compact" onClick={props.onNewTask}>
          <Plus size={18} /> משימה
        </button>
      </ViewHeader>
      <div className="filters">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="חיפוש משימה"
            placeholder="לחפש משהו ברשימה"
            value={props.filter}
            onChange={(e) => props.onFilter(e.target.value)}
          />
        </label>
        <select
          aria-label="סינון לפי תחום"
          value={props.category}
          onChange={(e) => props.onCategory(e.target.value)}
        >
          <option value="הכול">הכול</option>
          {TASK_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="tabs">
        <button
          className={!props.detailed ? "active" : ""}
          onClick={() => props.onDetailed(false)}
        >
          פשוט
        </button>
        <button
          className={props.detailed ? "active" : ""}
          onClick={() => props.onDetailed(true)}
        >
          מפורט
        </button>
        <button onClick={() => props.onNavigate("kit")}>הצעות לבית</button>
      </div>
      {!props.detailed ? (
        <div className="task-list">
          {TASK_CATEGORIES.map((cat) => {
            const items = props.state.tasks.filter(
              (t) =>
                isActiveVisibleTask(t, props.clock) &&
                t.categoryId === cat.id &&
                t.title.includes(props.filter),
            );
            if (!items.length) return null;
            const overdue = items.filter(
              (t) => t.dueAt && new Date(t.dueAt) < props.clock,
            ).length;
            const urgent = items.filter((t) => t.priority >= 3).length;
            return (
              <button
                key={cat.id}
                type="button"
                className="suggestion text-start"
                onClick={() => {
                  props.onCategory(cat.id);
                  props.onDetailed(true);
                }}
              >
                <h3>{cat.label}</h3>
                <p>
                  {items.length} פתוחות
                  {urgent ? ` · ${urgent} דחופות` : ""}
                  {overdue ? ` · ${overdue} אחרי מועד` : ""}
                </p>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="task-list">
          {getActiveTasksForList(props.state, props.clock, {
            text: props.filter,
            categoryId: props.category,
          })
            .filter((t) => props.matches(t))
            .map((t) => (
              <TaskCard
                state={props.state}
                busy={props.busy}
                clock={props.clock}
                detailed={props.detailed}
                onEdit={props.onEdit}
                onChat={props.onChat}
                onComplete={props.onComplete}
                onAction={props.onAction}
                key={t.id}
                task={t}
              />
            ))}
        </div>
      )}
      {props.detailed &&
        !getActiveTasksForList(props.state, props.clock, {
          text: props.filter,
          categoryId: props.category,
        }).some((t) => props.matches(t)) && (
          <Empty
            text="אין כרגע משימות בתצוגה הזאת."
            action={props.onNewTask}
            label="הוספת משימה"
          />
        )}
      {!props.detailed &&
        !props.state.tasks.some(
          (t) =>
            isActiveVisibleTask(t, props.clock) &&
            t.title.includes(props.filter),
        ) && (
          <Empty
            text="אין כרגע משימות בתצוגה הזאת."
            action={props.onNewTask}
            label="הוספת משימה"
          />
        )}
      <button
        className="quiet-link"
        onClick={() => props.onNavigate("history")}
      >
        היסטוריית ביצוע וביטולים
      </button>
    </>
  );
}
