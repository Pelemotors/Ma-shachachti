"use client";
import { useState, useCallback, useMemo } from "react";
import { Action, DailyPlanItem } from "@/lib/model";
import {
  buildDailyPlanSession,
  activeDailyPlan,
  planDay,
  estimatedMinutes,
} from "@/lib/engine";
import { durationToMinutes } from "@/components/duration-wheel";
import { authFetch } from "@/lib/supabase-browser";
import { useHousehold } from "@/lib/use-household";
import {
  clockForDateKey,
  dayKey,
  isoAtLocal,
  shiftDateKey,
  startOfDateKey,
} from "@/lib/time";
import {
  DAY_PART_ANCHORS,
  type DayPart,
  planForDate,
} from "@/lib/domain/planning/schedule-day";

type Household = ReturnType<typeof useHousehold>;

export function useDailyPlanController(
  h: Household,
  opts: {
    clock: Date;
    /** Optional seed from today's planning constraint — not shared live with free-time. */
    defaultEffort?: number;
    run: (actions: Action[], confirmed?: boolean) => Promise<void>;
    sendLock: { current: boolean };
  },
) {
  const { state, mode } = h;
  const timezone = state.profile.timezone;
  const todayKey = dayKey(opts.clock, timezone);
  const seed = opts.defaultEffort ?? state.planning.today?.effort ?? 2;
  const [planMinutes, setPlanMinutes] = useState(120);
  const [planHours, setPlanHours] = useState(2);
  const [planMinsPart, setPlanMinsPart] = useState(0);
  const [planEffort, setPlanEffort] = useState(seed);
  const [planReady, setPlanReady] = useState(Boolean(state.planning.plan));
  const [planPhase, setPlanPhase] = useState<"setup" | "result">(
    state.planning.plan ? "result" : "setup",
  );
  const [changedDay, setChangedDay] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayKey);

  const selectedClock = useMemo(
    () => clockForDateKey(selectedDate, timezone, opts.clock),
    [selectedDate, timezone, opts.clock],
  );
  const selectedPlan = planForDate(state, selectedDate);
  const persistedPlan = activeDailyPlan(state, opts.clock);
  const plan = planDay(state, planMinutes, planEffort, selectedClock);

  const onDuration = useCallback(
    ({ hours, minutes: m }: { hours: number; minutes: number }) => {
      setPlanHours(hours);
      setPlanMinsPart(m);
      setPlanMinutes(durationToMinutes(hours, m) || 120);
    },
    [],
  );

  const markReady = useCallback(() => {
    setPlanReady(true);
    setPlanPhase("result");
  }, []);

  const buildPlan = useCallback(async () => {
    const mins = durationToMinutes(planHours, planMinsPart);
    if (!mins) return;
    const session = buildDailyPlanSession(
      state,
      mins,
      planEffort as 1 | 2 | 3,
      h.currentRevision(),
      selectedClock,
    );
    await opts.run([{ type: "plan.set", plan: session }]);
    markReady();
  }, [
    planHours,
    planMinsPart,
    planEffort,
    state,
    opts,
    h,
    selectedClock,
    markReady,
  ]);

  const submitChangedDay = useCallback(async () => {
    if (planBusy || opts.sendLock.current) return;
    setPlanBusy(true);
    try {
      const turnId = crypto.randomUUID();
      const note = changedDay.trim();
      const mins = durationToMinutes(planHours, planMinsPart) || 120;

      // Functional contract: changedDay always reaches planning constraint + plan build.
      let nextState = await h.commit([
        {
          type: "planning.set",
          constraint: {
            date: selectedDate,
            availableFrom: null,
            availableUntil: null,
            unavailable: [],
            effort: planEffort as 1 | 2 | 3,
            note: note.slice(0, 500),
          },
        },
      ]);

      if (mode === "cloud" && note) {
        const response = await authFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: note,
            idempotencyKey: turnId,
            turnId,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (data.state && typeof data.revision === "number") {
          h.adoptRemote(data.state, data.revision);
          nextState = data.state;
        } else {
          const actions = (data.explicitActions ??
            data.actions ??
            []) as Action[];
          if (actions.length) nextState = await h.commit(actions);
        }
      }

      const session = buildDailyPlanSession(
        nextState,
        mins,
        planEffort as 1 | 2 | 3,
        h.currentRevision(),
        selectedClock,
      );
      await h.commit([{ type: "plan.set", plan: session }]);
      setChangedDay("");
      markReady();
    } catch (e) {
      h.setError(
        e instanceof Error
          ? e.message
          : "לא הצלחתי לסדר את היום. אפשר לנסות שוב.",
      );
    } finally {
      setPlanBusy(false);
    }
  }, [
    planBusy,
    opts,
    mode,
    changedDay,
    planHours,
    planMinsPart,
    planEffort,
    h,
    selectedDate,
    selectedClock,
    markReady,
  ]);

  const realignPlan = useCallback(async () => {
    if (changedDay.trim()) {
      await submitChangedDay();
      return;
    }
    await buildPlan();
  }, [changedDay, submitChangedDay, buildPlan]);

  const rebuild = useCallback(() => {
    void realignPlan();
  }, [realignPlan]);

  const resetForNavigation = useCallback(() => {
    setSelectedDate(dayKey(opts.clock, timezone));
  }, [opts.clock, timezone]);

  const goPrevDay = useCallback(() => {
    setSelectedDate((current) => shiftDateKey(current, -1));
  }, []);

  const goNextDay = useCallback(() => {
    setSelectedDate((current) => shiftDateKey(current, 1));
  }, []);

  const patchPlanItem = useCallback(
    async (taskId: string, patch: Partial<DailyPlanItem>) => {
      await opts.run([{ type: "plan.itemUpdate", taskId, patch }]);
    },
    [opts],
  );

  const removeFromPlan = useCallback(
    async (taskId: string) => {
      await patchPlanItem(taskId, { planStatus: "skipped", locked: true });
    },
    [patchPlanItem],
  );

  const changeItemTime = useCallback(
    async (taskId: string, hhmm: string) => {
      const plan = planForDate(state, selectedDate);
      const item = plan?.items.find((row) => row.taskId === taskId);
      const task = state.tasks.find((row) => row.id === taskId);
      if (!item || !task) return;
      const [hour, minute] = hhmm.split(":").map(Number);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;
      const start = isoAtLocal(selectedDate, hour, minute, timezone);
      const durationMs =
        item.plannedStart && item.plannedEnd
          ? Math.max(
              5 * 60000,
              Date.parse(item.plannedEnd) - Date.parse(item.plannedStart),
            )
          : Math.max(5 * 60000, estimatedMinutes(task, state) * 60000);
      await patchPlanItem(taskId, {
        plannedStart: start,
        plannedEnd: new Date(Date.parse(start) + durationMs).toISOString(),
      });
    },
    [state, selectedDate, timezone, patchPlanItem],
  );

  const moveItemDayPart = useCallback(
    async (taskId: string, part: Exclude<DayPart, "unscheduled">) => {
      const anchor = DAY_PART_ANCHORS[part];
      const hhmm = `${String(anchor.hour).padStart(2, "0")}:${String(anchor.minute).padStart(2, "0")}`;
      await changeItemTime(taskId, hhmm);
    },
    [changeItemTime],
  );

  const moveItemToDate = useCallback(
    async (taskId: string, dateKey: string) => {
      if (!dateKey || dateKey === selectedDate) return;
      await opts.run([
        {
          type: "task.deferUntil",
          id: taskId,
          hiddenUntil: startOfDateKey(dateKey, timezone),
        },
      ]);
    },
    [opts, selectedDate, timezone],
  );

  const deferSelectedDay = useCallback(
    async (taskId: string) => {
      await opts.run([
        {
          type: "task.deferUntil",
          id: taskId,
          hiddenUntil: startOfDateKey(shiftDateKey(selectedDate, 1), timezone),
        },
      ]);
    },
    [opts, selectedDate, timezone],
  );

  return {
    planMinutes,
    planHours,
    planMinsPart,
    planEffort,
    setPlanEffort,
    planReady,
    planPhase,
    changedDay,
    setChangedDay,
    planBusy,
    persistedPlan,
    selectedPlan,
    selectedDate,
    selectedClock,
    todayKey,
    setSelectedDate,
    goPrevDay,
    goNextDay,
    plan,
    onDuration,
    buildPlan,
    submitChangedDay,
    realignPlan,
    rebuild,
    resetForNavigation,
    setPlanPhase,
    setPlanReady,
    removeFromPlan,
    changeItemTime,
    moveItemDayPart,
    moveItemToDate,
    deferSelectedDay,
  };
}

export type DailyPlanController = ReturnType<typeof useDailyPlanController>;
