import { registerAction } from "./index.ts";

registerAction("notification.action", (adapter, action) =>
  adapter.notificationAction(action.input),
);
