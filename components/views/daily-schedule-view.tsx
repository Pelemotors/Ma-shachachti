"use client";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Action, AppState, Task } from "@/lib/model";
import { ViewHeader } from "@/components/view-header";
import { Empty } from "@/components/empty-state";
import { PlanSetupView } from "@/components/views/plan-setup-view";
import { ScheduleItemRow } from "@/components/schedule-item-row";
import { durationToMinutes } from "@/components/duration-wheel";
import { shiftDateKey } from "@/lib/time";
import {
  DAY_PART_LABELS,
  formatShortDate,
  groupScheduleRows,
  scheduleRowsForPlan,
} from "@/lib/domain/planning/schedule-day";
import type { DailyPlanController } from "@/hooks/use-daily-plan-controller";

export function DailyScheduleView(props: {
  state: AppState;
  busy: boolean;
  mode: string;
  plan: DailyPlanController;
  onEdit: (t: Task) => void;
  onComplete: (t: Task) => void;
  onAction: (a: Action) => Promise<void>;
  onNeedConsent: () => void;
  onError: (msg: string) => void;
}) {
  const dateInput = useRef<HTMLInputElement>(null);
  const { plan } = props;
  const timezone = props.state.profile.timezone;
  const selectedPlan = plan.selectedPlan;
  const rows = selectedPlan
    ? scheduleRowsForPlan(props.state, selectedPlan, timezone)
    : [];
  const groups = groupScheduleRows(rows);
  const prevKey = formatShortDate(shiftDateKey(plan.selectedDate, -1));
  const nextKey = formatShortDate(shiftDateKey(plan.selectedDate, 1));
  const canBuild =
    durationToMinutes(plan.planHours, plan.planMinsPart) > 0 && !plan.planBusy;

  return (
    <div className="daily-schedule">
      <ViewHeader view="plan" title="הלו״ז שלי" />
      <nav className="schedule-day-nav" aria-label="בחירת יום" dir="ltr">
        <button
          type="button"
          className="icon-button"
          aria-label="יום קודם"
          onClick={plan.goPrevDay}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          className="schedule-day-side"
          onClick={plan.goPrevDay}
        >
          {prevKey}
        </button>
        <button
          type="button"
          className="schedule-day-current"
          onClick={() =>
            dateInput.current?.showPicker?.() ?? dateInput.current?.focus()
          }
        >
          {plan.selectedDate === plan.todayKey
            ? `היום, ${formatShortDate(plan.selectedDate)}`
            : formatShortDate(plan.selectedDate)}
        </button>
        <button
          type="button"
          className="schedule-day-side"
          onClick={plan.goNextDay}
        >
          {nextKey}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="יום הבא"
          onClick={plan.goNextDay}
        >
          <ChevronRight size={18} />
        </button>
        <label className="sr-only">
          בחירת תאריך
          <input
            ref={dateInput}
            type="date"
            value={plan.selectedDate}
            onChange={(e) => {
              if (e.target.value) plan.setSelectedDate(e.target.value);
            }}
          />
        </label>
      </nav>

      <PlanSetupView
        compact
        planHours={plan.planHours}
        planMinsPart={plan.planMinsPart}
        effort={plan.planEffort}
        changedDay={plan.changedDay}
        planBusy={plan.planBusy}
        mode={props.mode}
        aiConsent={props.state.profile.aiConsent}
        onDuration={plan.onDuration}
        onEffort={plan.setPlanEffort}
        onChangedDay={plan.setChangedDay}
        onChangedDaySubmit={() => void plan.submitChangedDay()}
        onNeedConsent={props.onNeedConsent}
        onError={props.onError}
      />

      {selectedPlan && rows.length ? (
        <>
          <div className="schedule-list">
            {groups.map((group) => (
              <section key={group.part} className="schedule-part">
                <h3>{DAY_PART_LABELS[group.part]}</h3>
                {group.items.map((row) => (
                  <ScheduleItemRow
                    key={row.item.taskId}
                    task={row.task}
                    state={props.state}
                    busy={props.busy || plan.planBusy}
                    timeLabel={row.timeLabel}
                    timeInput={row.timeInput}
                    selectedDate={plan.selectedDate}
                    onEdit={props.onEdit}
                    onComplete={props.onComplete}
                    onAction={props.onAction}
                    onDefer={(id) => plan.deferSelectedDay(id)}
                    onChangeTime={(id, hhmm) => plan.changeItemTime(id, hhmm)}
                    onMoveDayPart={(id, part) => plan.moveItemDayPart(id, part)}
                    onMoveToDate={(id, date) => plan.moveItemToDate(id, date)}
                    onRemoveFromPlan={(id) => plan.removeFromPlan(id)}
                  />
                ))}
              </section>
            ))}
          </div>
          <div className="button-row schedule-footer">
            <button
              className="secondary"
              type="button"
              disabled={!canBuild}
              onClick={() => void plan.realignPlan()}
            >
              התאם מחדש את הלו״ז
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => window.print()}
            >
              הדפסת התוכנית / שמירה כ־PDF
            </button>
          </div>
        </>
      ) : (
        <div className="schedule-empty">
          <Empty text="עדיין לא נבנה לו״ז ליום הזה." />
          <button
            className="primary"
            type="button"
            disabled={!canBuild}
            onClick={() => void plan.buildPlan()}
          >
            בנה לי לו״ז
          </button>
        </div>
      )}
    </div>
  );
}
