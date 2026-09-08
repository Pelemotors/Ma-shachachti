"use client";
import { useState, useCallback, useEffect } from "react";
import { Action } from "@/lib/model";
import { buildDailyPlanSession, activeDailyPlan, planDay } from "@/lib/engine";
import { durationToMinutes } from "@/components/duration-wheel";
import { authFetch } from "@/lib/supabase-browser";
import { useHousehold } from "@/lib/use-household";

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
  const seed = opts.defaultEffort ?? state.planning.today?.effort ?? 2;
  const [planMinutes, setPlanMinutes] = useState(120);
  const [planHours, setPlanHours] = useState(2);
  const [planMinsPart, setPlanMinsPart] = useState(0);
  const [planEffort, setPlanEffort] = useState(seed);
  const [planReady, setPlanReady] = useState(false);
  const [planPhase, setPlanPhase] = useState<"setup" | "result">("setup");
  const [changedDay, setChangedDay] = useState("");
  const [planBusy, setPlanBusy] = useState(false);

  useEffect(() => {
    if (state.planning.plan) {
      setPlanPhase("result");
      setPlanReady(true);
    }
  }, [state.planning.plan?.id]);

  const persistedPlan = activeDailyPlan(state, opts.clock);
  const plan = planDay(state, planMinutes, planEffort, opts.clock);

  const onDuration = useCallback(
    ({ hours, minutes: m }: { hours: number; minutes: number }) => {
      setPlanHours(hours);
      setPlanMinsPart(m);
      setPlanMinutes(durationToMinutes(hours, m) || 120);
    },
    [],
  );

  const buildPlan = useCallback(async () => {
    const mins = durationToMinutes(planHours, planMinsPart);
    if (!mins) return;
    const session = buildDailyPlanSession(
      state,
      mins,
      planEffort as 1 | 2 | 3,
      h.currentRevision(),
      opts.clock,
    );
    await opts.run([{ type: "plan.set", plan: session }]);
    setPlanReady(true);
    setPlanPhase("result");
  }, [planHours, planMinsPart, planEffort, state, opts, h]);

  const submitChangedDay = useCallback(async () => {
    if (planBusy || opts.sendLock.current) return;
    setPlanBusy(true);
    try {
      const turnId = crypto.randomUUID();
      const note = changedDay.trim();
      const mins = durationToMinutes(planHours, planMinsPart) || 120;
      const dateKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: state.profile.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(opts.clock);

      // Functional contract: changedDay always reaches planning constraint + plan build.
      let nextState = await h.commit([
        {
          type: "planning.set",
          constraint: {
            date: dateKey,
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
        opts.clock,
      );
      await h.commit([{ type: "plan.set", plan: session }]);
      setChangedDay("");
      setPlanPhase("result");
      setPlanReady(true);
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
    state,
    mode,
    changedDay,
    planHours,
    planMinsPart,
    planEffort,
    h,
  ]);

  const rebuild = useCallback(() => {
    setPlanPhase("setup");
    void opts.run([{ type: "plan.clear" }]);
  }, [opts]);

  const resetForNavigation = useCallback(() => {
    setPlanReady(false);
  }, []);

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
    plan,
    onDuration,
    buildPlan,
    submitChangedDay,
    rebuild,
    resetForNavigation,
    setPlanPhase,
    setPlanReady,
  };
}

export type DailyPlanController = ReturnType<typeof useDailyPlanController>;
