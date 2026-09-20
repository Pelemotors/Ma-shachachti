import { registerAction } from "./index.ts";

registerAction("calendar.action", (adapter, action) => adapter.calendarAction(action.input));
