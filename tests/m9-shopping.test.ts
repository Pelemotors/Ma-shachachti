import assert from "node:assert/strict";
import { test } from "node:test";
import { shoppingMutationSchema } from "../lib/lists.ts";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("M9 shopping mutations accept notes and preserve the existing lifecycle contract", () => {
  assert.equal(shoppingMutationSchema.safeParse({ action: "add", title: "קפה", notes: "בלי קפאין" }).success, true);
  assert.equal(shoppingMutationSchema.safeParse({ action: "update", id: "11111111-1111-4111-8111-111111111111", title: "קפה טחון", notes: "חזק" }).success, true);
  assert.equal(shoppingMutationSchema.safeParse({ action: "toggle", id: "11111111-1111-4111-8111-111111111111", purchased: true }).success, true);
  assert.equal(shoppingMutationSchema.safeParse({ action: "remove", id: "11111111-1111-4111-8111-111111111111" }).success, true);
});

test("M9 shopping screen waits for server responses before replacing state", () => {
  const screen = read("../apps/mobile/src/screens/ShoppingScreen.tsx");
  assert.match(screen, /setItems\(data\.shopping\)/);
  assert.match(screen, /await updateShopping/);
  assert.match(screen, /await removeShopping/);
  assert.match(screen, /purchased_at/);
});
