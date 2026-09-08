"use client";
import { useState, useCallback } from "react";
import { Action, Task } from "@/lib/model";
import { requiresConfirmation, shouldAskWorkTime } from "@/lib/engine";
import { useHousehold } from "@/lib/use-household";
import {
  isLifeAdminTask,
  minutesOfDay,
  shouldAskLifeAdminWindowConfirm,
  type LifeAdminConfirmResponse,
} from "@/lib/domain/notifications/life-admin";

type Household = ReturnType<typeof useHousehold>;

export function useTaskController(h: Household) {
  const { busy, state } = h;
  const [editor, setEditor] = useState<Task | "new" | null>(null);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("הכול");
  const [detailed, setDetailed] = useState(false);
  const [completion, setCompletion] = useState<Task | null>(null);
  const [workActual, setWorkActual] = useState("");
  const [confirm, setConfirm] = useState<Action[] | null>(null);
  const [lifeAdminPrompt, setLifeAdminPrompt] = useState<{
    completedAtMinutes: number;
  } | null>(null);

  const run = useCallback(
    async (actions: Action[], confirmed = false) => {
      await h.commit(actions, confirmed);
    },
    [h],
  );

  const act = useCallback(
    async (a: Action) => {
      if (requiresConfirmation([a])) {
        setConfirm([a]);
        return;
      }
      await run([a]);
    },
    [run],
  );

  const openCompletion = useCallback(
    async (t: Task) => {
      setCompletion(t);
      setWorkActual("");
      // Stamp once when we are about to present duration feedback — even if dismissed.
      if (shouldAskWorkTime(t, state)) {
        try {
          await run([{ type: "durationFeedback.markAsked", taskId: t.id }]);
        } catch {
          /* non-blocking */
        }
      }
    },
    [run, state],
  );

  const submitCompletion = useCallback(async () => {
    if (!completion) return;
    const finished = completion;
    await run([
      {
        type: "task.status",
        id: finished.id,
        status: "done",
        ...(workActual ? { actualWorkMinutes: +workActual } : {}),
      },
    ]);
    setCompletion(null);
    if (
      isLifeAdminTask(finished) &&
      shouldAskLifeAdminWindowConfirm(state.compactedMemory)
    ) {
      setLifeAdminPrompt({
        completedAtMinutes: minutesOfDay(new Date(), state.profile.timezone),
      });
    }
  }, [
    completion,
    workActual,
    run,
    state.compactedMemory,
    state.profile.timezone,
  ]);

  const submitLifeAdminResponse = useCallback(
    async (response: LifeAdminConfirmResponse) => {
      if (!lifeAdminPrompt) return;
      await run([
        {
          type: "memory.lifeAdmin",
          response,
          completedAtMinutes: lifeAdminPrompt.completedAtMinutes,
        },
      ]);
      setLifeAdminPrompt(null);
    },
    [lifeAdminPrompt, run],
  );

  const confirmActions = useCallback(async () => {
    if (!confirm) return;
    await run(confirm, true);
    setConfirm(null);
  }, [confirm, run]);

  const matches = useCallback(
    (t: Task) =>
      (category === "הכול" || t.categoryId === category) &&
      t.title.includes(filter),
    [category, filter],
  );

  return {
    busy,
    editor,
    setEditor,
    filter,
    setFilter,
    category,
    setCategory,
    detailed,
    setDetailed,
    completion,
    setCompletion,
    workActual,
    setWorkActual,
    confirm,
    setConfirm,
    lifeAdminPrompt,
    setLifeAdminPrompt,
    run,
    act,
    openCompletion,
    submitCompletion,
    submitLifeAdminResponse,
    confirmActions,
    matches,
  };
}

export type TaskController = ReturnType<typeof useTaskController>;
