import { registerAction } from "./index.ts";

registerAction("voice.bank", (adapter, action) => adapter.bankJobAction(action.input));
