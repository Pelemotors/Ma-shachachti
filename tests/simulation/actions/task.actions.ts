import { registerAction } from "./index.ts";

registerAction("task.create", (adapter, action) => adapter.createTask(action.input));
registerAction("task.update", (adapter, action) => adapter.updateTask(action.input));
registerAction("task.complete", (adapter, action) => adapter.completeTask(action.input));
registerAction("task.delete", (adapter, action) => adapter.deleteTask(action.input));
registerAction("task.list", (adapter) => adapter.listTasks());
