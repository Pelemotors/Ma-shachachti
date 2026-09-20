import { registerAction } from "./index.ts";

registerAction("chat.send", (adapter, action) => adapter.sendChatMessage(action.input));
