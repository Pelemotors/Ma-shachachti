import type { ProductAdapter, AdapterCallResult } from "../adapters/product-adapter.ts";
import type { SimulationAction } from "../schemas/action.schema.ts";
import type { VirtualClock } from "../runner/virtual-clock.ts";

export type ActionExecutor = (
  adapter: ProductAdapter,
  action: SimulationAction,
  clock: VirtualClock,
) => Promise<AdapterCallResult>;

export const actionExecutors: Record<string, ActionExecutor> = {};

export function registerAction(type: string, executor: ActionExecutor): void {
  actionExecutors[type] = executor;
}

export async function executeRegisteredAction(
  adapter: ProductAdapter,
  action: SimulationAction,
  clock: VirtualClock,
): Promise<AdapterCallResult> {
  if (action.type === "time.advance") {
    const minutes = Number(action.input.minutes ?? 0);
    clock.advanceMinutes(minutes);
    return {
      ok: true,
      status: 200,
      body: { now: clock.nowIso() },
      requestSummary: { type: action.type, minutes },
      responseSummary: { now: clock.nowIso() },
    };
  }
  const executor = actionExecutors[action.type];
  if (!executor) {
    return {
      ok: false,
      status: 400,
      body: { error: `Unknown action type ${action.type}` },
      requestSummary: { type: action.type },
      responseSummary: { error: "unknown_action" },
    };
  }
  return executor(adapter, action, clock);
}
