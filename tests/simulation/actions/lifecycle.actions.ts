import { registerAction } from "./index.ts";

registerAction("engine.ping", async (_adapter, action, clock) => ({
  ok: true,
  status: 200,
  body: { pong: true, at: clock.nowIso(), note: action.input.note ?? null },
  requestSummary: { type: "engine.ping" },
  responseSummary: { pong: true },
}));

registerAction("engine.auth", async (adapter) => adapter.authenticate({}));
