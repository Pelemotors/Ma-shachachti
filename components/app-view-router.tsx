"use client";
import type { RefObject } from "react";
import { Action, AppState, Task } from "@/lib/model";
import type { AppView } from "./view-header";
import { HomeView } from "./views/home-view";
import { ChatView } from "./views/chat-view";
import { TasksView } from "./views/tasks-view";
import { ShoppingView } from "./views/shopping-view";
import { ChecklistsView, checklistViewProps } from "./views/checklists-view";
import { DailyScheduleView } from "./views/daily-schedule-view";
import { FreeTimeView } from "./views/free-time-view";
import { FocusView } from "./views/focus-view";
import { RemindersView } from "./views/reminders-view";
import { MemoryView } from "./views/memory-view";
import { SettingsView } from "./views/settings-view";
import { HistoryView } from "./views/history-view";
import { KitView } from "./views/kit-view";
import type { ChatController } from "@/hooks/use-chat-controller";
import type { TaskController } from "@/hooks/use-task-controller";
import type { DailyPlanController } from "@/hooks/use-daily-plan-controller";
import type { FreeTimeController } from "@/hooks/use-free-time-controller";
import type { ShoppingController } from "@/hooks/use-shopping-controller";
import type { ChecklistController } from "@/hooks/use-checklist-controller";
import type { ReminderController } from "@/hooks/use-reminder-controller";

type TaskCardHandlers = {
  onEdit: (t: Task) => void;
  onChat: (t: Task) => void;
  onComplete: (t: Task) => void;
  onAction: (a: Action) => Promise<void>;
};

export function AppViewRouter(props: {
  view: AppView;
  state: AppState;
  busy: boolean;
  mode: string;
  clock: Date;
  greetingHour: string;
  revision?: number;
  tasks: TaskController;
  chat: ChatController;
  free: FreeTimeController;
  plan: DailyPlanController;
  shopping: ShoppingController;
  checklists: ChecklistController;
  reminders: ReminderController;
  chatBottomRef: RefObject<HTMLDivElement | null>;
  taskCardHandlers: TaskCardHandlers;
  navigate: (v: AppView) => void;
  onNotice: (msg: string) => void;
  onError?: (msg: string) => void;
  onExport: () => void;
  onSignOut: () => void;
  onAskForecast: () => void;
}) {
  const {
    view,
    state,
    busy,
    mode,
    clock,
    greetingHour,
    tasks,
    chat,
    free,
    plan,
    shopping,
    reminders,
    chatBottomRef,
    taskCardHandlers,
    navigate,
  } = props;

  if (view === "home")
    return (
      <HomeView
        state={state}
        busy={busy}
        clock={clock}
        detailed={tasks.detailed}
        greetingHour={greetingHour}
        onNavigate={navigate}
        onOpenPlan={() => {
          plan.resetForNavigation();
          navigate("plan");
        }}
        onAskForecast={props.onAskForecast}
        onNewTask={() => tasks.setEditor("new")}
        {...taskCardHandlers}
      />
    );
  if (view === "tasks")
    return (
      <TasksView
        state={state}
        busy={busy}
        clock={clock}
        filter={tasks.filter}
        category={tasks.category}
        detailed={tasks.detailed}
        matches={tasks.matches}
        onFilter={tasks.setFilter}
        onCategory={tasks.setCategory}
        onDetailed={tasks.setDetailed}
        onNavigate={navigate}
        onNewTask={() => tasks.setEditor("new")}
        {...taskCardHandlers}
      />
    );
  if (view === "focus")
    return (
      <FocusView
        state={state}
        busy={busy}
        clock={clock}
        detailed={tasks.detailed}
        {...taskCardHandlers}
      />
    );
  if (view === "free")
    return (
      <FreeTimeView
        state={state}
        busy={busy}
        clock={clock}
        detailed={tasks.detailed}
        freeHours={free.freeHours}
        freeMinsPart={free.freeMinsPart}
        effort={free.effort}
        closeFirst={free.free.closeFirst}
        outsidePlan={free.free.outsidePlan}
        importantTitles={free.legacyFree.important.map((t) => t.title)}
        onDuration={free.onDuration}
        onEffort={free.setEffort}
        {...taskCardHandlers}
      />
    );
  if (view === "plan")
    return (
      <>
        {plan.planBusy && (
          <div className="plan-overlay" role="status" aria-live="polite">
            <div className="panel">מסדר את היום שלך…</div>
          </div>
        )}
        <DailyScheduleView
          state={state}
          busy={busy}
          mode={mode}
          plan={plan}
          onEdit={taskCardHandlers.onEdit}
          onComplete={taskCardHandlers.onComplete}
          onAction={taskCardHandlers.onAction}
          onNeedConsent={() => navigate("settings")}
          onError={(msg) =>
            props.onError ? props.onError(msg) : props.onNotice(msg)
          }
        />
      </>
    );
  if (view === "shopping")
    return (
      <ShoppingView
        newItem={shopping.newItem}
        quantity={shopping.quantity}
        busy={shopping.busy}
        items={shopping.items}
        empty={!state.shopping.length}
        onNewItem={shopping.setNewItem}
        onQuantity={shopping.setQuantity}
        onAdd={() => void shopping.addItem()}
        onToggle={shopping.toggleItem}
        onRemove={shopping.removeItem}
      />
    );
  if (view === "checklists")
    return <ChecklistsView {...checklistViewProps(props.checklists)} />;
  if (view === "chat")
    return (
      <ChatView
        state={state}
        busy={busy}
        context={chat.context}
        thinking={chat.isThinking}
        sendStatus={chat.sendStatus}
        pendingUserMessage={chat.pendingUserMessage}
        onRetrySend={() => void chat.retrySend()}
        proposal={chat.proposal}
        proposalSummary={chat.proposalMeta?.summary}
        similarHints={chat.proposalMeta?.similarHints}
        chatBottomRef={chatBottomRef}
        onClearContext={() => chat.setContext(null)}
        onNewTask={() => tasks.setEditor("new")}
        onSetDraft={chat.setDraft}
        onApprove={() => void chat.approveProposal()}
        onReject={() => void chat.rejectProposal()}
        onRemoveProposalItem={chat.removeProposalAction}
      />
    );
  if (view === "kit")
    return (
      <KitView
        state={state}
        busy={busy}
        clock={clock}
        category={tasks.category}
        onCategory={tasks.setCategory}
        act={tasks.act}
        run={tasks.run}
        revision={props.revision ?? 0}
        onOpenSettings={() => navigate("settings")}
        onStartScan={() => {
          const id = crypto.randomUUID();
          const stamp = new Date().toISOString();
          void tasks.act({
            type: "scan.set",
            firstScan: {
              status: "in_progress",
              completedAt: state.firstScan.completedAt ?? null,
              session: {
                id,
                status: "in_progress",
                chunks: [],
                draftAnalysis: null,
                proposalId: null,
                createdAt: stamp,
                updatedAt: stamp,
              },
            },
          });
        }}
      />
    );
  if (view === "memory")
    return (
      <MemoryView
        state={state}
        busy={busy}
        clock={clock}
        run={tasks.run}
        act={tasks.act}
        onRemember={chat.processMemory}
        onEditTask={tasks.setEditor}
        onNotice={props.onNotice}
      />
    );
  if (view === "reminders")
    return (
      <RemindersView
        state={state}
        busy={busy}
        mode={mode}
        pushEnabled={reminders.pushEnabled}
        pushBusy={reminders.pushBusy}
        pushReady={reminders.pushReady}
        reminderTitle={reminders.reminderTitle}
        reminderDue={reminders.reminderDue}
        reminderUrgency={reminders.reminderUrgency}
        reminders={reminders.remindersSorted}
        onTitle={reminders.setReminderTitle}
        onDue={reminders.setReminderDue}
        onUrgency={reminders.setReminderUrgency}
        onAdd={() => void reminders.addReminder()}
        onEnablePush={() => void reminders.enablePush()}
        onCancel={(id) => void tasks.act({ type: "reminder.cancel", id })}
        onUpdate={(id, patch) => reminders.updateReminder(id, patch)}
      />
    );
  if (view === "history")
    return (
      <HistoryView
        state={state}
        busy={busy}
        clock={clock}
        detailed={tasks.detailed}
        {...taskCardHandlers}
      />
    );
  if (view === "settings")
    return (
      <SettingsView
        state={state}
        mode={mode}
        pushBusy={reminders.pushBusy}
        pushEnabled={reminders.pushEnabled}
        pushReady={reminders.pushReady}
        run={tasks.run}
        onNavigate={navigate}
        onExport={props.onExport}
        onEnablePush={() => void reminders.enablePush()}
        onDisablePush={() => void reminders.disablePush()}
        onClearHistory={() => tasks.setConfirm([{ type: "history.clear" }])}
        onSignOut={props.onSignOut}
      />
    );
  return null;
}
