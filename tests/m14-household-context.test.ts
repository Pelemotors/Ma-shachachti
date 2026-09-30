import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { profileUpdateSchema } from "../lib/user-profile.ts";

const root = new URL("../", import.meta.url);

function read(rel: string) {
  return readFileSync(new URL(rel, root), "utf8");
}

test("M14 household context accepts all home fields and partial patches", () => {
  const result = profileUpdateSchema.safeParse({
    household_context: {
      adults: 2,
      children: 1,
      babies: 0,
      rooms: 4,
      bathrooms: 2,
      floors: 1,
      features: ["מרפסת", "ממ״ד"],
      pets: ["כלב"],
      free_text: "יש מדרגות בכניסה",
    },
  });
  assert.equal(result.success, true);
  assert.equal(
    profileUpdateSchema.safeParse({ household_context: { pets: ["חתול"] } }).success,
    true,
  );
});

test("M14 rejects invalid household values safely", () => {
  assert.equal(
    profileUpdateSchema.safeParse({ household_context: { adults: -1 } }).success,
    false,
  );
  assert.equal(
    profileUpdateSchema.safeParse({ household_context: { rooms: 101 } }).success,
    false,
  );
  assert.equal(
    profileUpdateSchema.safeParse({ household_context: { features: [""] } }).success,
    false,
  );
});

test("M14 persists household context through the canonical profile API only", () => {
  const route = read("app/api/profile/route.ts");
  const api = read("apps/mobile/src/api/profile.ts");
  const screen = read("apps/mobile/src/screens/HouseholdScreen.tsx");
  const migration = read("database/migrations/20260930_household_context.sql");

  for (const field of ["adults", "children", "babies", "rooms", "bathrooms", "floors", "features", "pets", "free_text"]) {
    assert.match(screen, new RegExp(field));
  }
  assert.match(api, /household_context/);
  assert.match(route, /household_context/);
  assert.match(route, /const existing = await readProfile/);
  assert.match(route, /\.\.\.existing\.household_context/);
  assert.match(migration, /alter table public\.user_profiles/);
  assert.match(migration, /jsonb not null default '\{\}'::jsonb/);
  assert.doesNotMatch(screen, /createTask|replanDay|householdAction\("create"\).*context/);
});

test("M14 household context is not wired to domain mutations", () => {
  const source = read("apps/mobile/src/screens/HouseholdScreen.tsx");
  assert.doesNotMatch(source, /createTask|createReminder|createRoutine|replanDay|updateDayPlan/);
  assert.match(source, /updateProfile\(\{ household_context: context \}\)/);
});
