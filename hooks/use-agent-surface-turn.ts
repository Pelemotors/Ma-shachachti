"use client";
import { useCallback, useRef, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import type { useHousehold } from "@/lib/use-household";
import type { AgentSurface } from "@/lib/agent/surfaces";

type Household = ReturnType<typeof useHousehold>;

export type AgentSurfaceTurnStatus = "idle" | "loading" | "ready" | "error";

function apiError(data: unknown, fallback: string) {
  const obj =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return new Error(typeof obj.error === "string" ? obj.error : fallback);
}

export function useAgentSurfaceTurn(opts: {
  household: Household;
  persistServerProposal?: (data: unknown) => boolean;
  sendLock: { current: boolean };
}) {
  const { household: h, persistServerProposal, sendLock } = opts;
  const [status, setStatus] = useState<AgentSurfaceTurnStatus>("idle");
  const [reply, setReply] = useState("");
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  const request = useCallback(
    async (input: {
      surface: AgentSurface;
      message: string;
      availableMinutes?: number;
      effort?: number;
    }) => {
      if (inFlight.current || sendLock.current) return;
      if (h.mode !== "cloud") {
        setStatus("error");
        setError("הסוכן לא זמין כרגע. אפשר לנסות שוב אחרי חיבור לחשבון.");
        return;
      }
      if (!h.state.profile.aiConsent) {
        setStatus("error");
        setError("אפשר להפעיל עזרה אישית בהגדרות, ואז לנסות שוב.");
        return;
      }
      inFlight.current = true;
      sendLock.current = true;
      setStatus("loading");
      setError("");
      try {
        const turnId = crypto.randomUUID();
        const response = await authFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: input.message,
            idempotencyKey: turnId,
            turnId,
            surface: input.surface,
            availableMinutes: input.availableMinutes,
            effort: input.effort,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw apiError(data, "הסוכן לא זמין כרגע.");
        if (data.state && typeof data.revision === "number")
          h.adoptRemote(data.state, data.revision);
        persistServerProposal?.(data);
        const ids = Array.isArray(data.presentation?.taskIds)
          ? (data.presentation.taskIds as string[])
          : [];
        setTaskIds(ids);
        setReply(typeof data.reply === "string" ? data.reply : "");
        setStatus("ready");
      } catch (e) {
        setStatus("error");
        setError(
          e instanceof Error ? e.message : "הסוכן לא זמין כרגע. אפשר לנסות שוב.",
        );
      } finally {
        inFlight.current = false;
        sendLock.current = false;
      }
    },
    [h, persistServerProposal, sendLock],
  );

  return { status, reply, taskIds, error, request };
}
