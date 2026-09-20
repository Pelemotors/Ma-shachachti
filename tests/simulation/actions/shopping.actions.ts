import { registerAction } from "./index.ts";

registerAction("shopping.create", (adapter, action) => adapter.createShoppingItem(action.input));
registerAction("shopping.update", (adapter, action) => adapter.updateShoppingItem(action.input));
registerAction("shopping.complete", (adapter, action) =>
  adapter.completeShoppingItem(action.input),
);
