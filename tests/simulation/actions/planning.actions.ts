import { registerAction } from "./index.ts";

registerAction("plan.get", (adapter, action) => adapter.getDayPlan(action.input));
registerAction("plan.update", (adapter, action) => adapter.updateDayPlan(action.input));
registerAction("plan.replan", (adapter, action) => adapter.replanDay(action.input));
registerAction("plan.forgotten", (adapter, action) => adapter.getForgotten(action.input));
registerAction("plan.freetime", (adapter, action) =>
  adapter.getFreeTimeRecommendations(action.input),
);
