import { registerAction } from "./index.ts";

registerAction("checklist.create", (adapter, action) => adapter.createChecklist(action.input));
registerAction("checklist.update", (adapter, action) => adapter.updateChecklist(action.input));
