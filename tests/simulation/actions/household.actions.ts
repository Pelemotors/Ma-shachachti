import { registerAction } from "./index.ts";

registerAction("household.action", (adapter, action) => adapter.householdAction(action.input));
