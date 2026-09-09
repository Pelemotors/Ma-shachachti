"use client";
import { useState, useCallback, useMemo } from "react";
import { estimatedMinutes } from "@/lib/engine";
import { durationToMinutes } from "@/components/duration-wheel";
import { isActiveVisibleTask } from "@/lib/domain/tasks/visibility";
import { AppState } from "@/lib/model";

export function useFreeTimeController(opts: { state: AppState; clock: Date }) {
  const [minutes, setMinutes] = useState(30);
  const [effort, setEffort] = useState(2);
  const [freeHours, setFreeHours] = useState(0);
  const [freeMinsPart, setFreeMinsPart] = useState(30);

  const onDuration = useCallback(
    ({ hours, minutes: m }: { hours: number; minutes: number }) => {
      setFreeHours(hours);
      setFreeMinsPart(m);
      setMinutes(durationToMinutes(hours, m) || 5);
    },
    [],
  );

  const available = durationToMinutes(freeHours, freeMinsPart) || minutes;
  const matching = useMemo(
    () =>
      opts.state.tasks.filter(
        (task) =>
          task.status === "open" &&
          isActiveVisibleTask(task, opts.clock) &&
          estimatedMinutes(task, opts.state) <= available,
      ),
    [opts.state, opts.clock, available],
  );

  return {
    minutes,
    effort,
    setEffort,
    freeHours,
    freeMinsPart,
    onDuration,
    free: { closeFirst: matching, outsidePlan: [] },
    legacyFree: { important: [] as { title: string }[] },
  };
}

export type FreeTimeController = ReturnType<typeof useFreeTimeController>;
