import type { AppState, Profile } from "../model";
import { catalog as rawCatalog } from "../catalog-data";
import type { CategoryId } from "../taxonomy";

export type DefaultCadence =
  "daily" | "frequent" | "weekly" | "biweekly" | "monthly" | "occasional";

export type InitialVisibility = "starter" | "learned" | "hidden";

const HIDDEN_DETAILS = new Set([
  "oven_clean",
  "fridge_clean",
  "microwave_clean",
  "hood_clean",
  "cabinet_clean",
  "deep_clean",
]);

const HIDDEN_TITLE_RE =
  /ניקוי (תנור|מקרר|מיקרוגל|קולט|ארונות)|ניקיון עומק|כביסת שמיכות|כביסת מגני/;

const STARTER_DETAILS = new Set([
  "dishwasher_empty",
  "dishwasher_run",
  "dishes_handwash",
  "countertop_clear",
  "sink_clean",
  "trash_take_out",
  "living_clear",
  "sofa_tidy",
  "toys_collect",
  "laundry_sort",
  "laundry_run",
  "laundry_fold",
  "kids_toys",
  "kids_bag",
  "pet_water",
  "reset_surfaces",
  "reset_trash",
]);

function inferCadence(item: {
  categoryId: CategoryId;
  detailTypeId: string | null;
  title: string;
}): DefaultCadence {
  if (
    HIDDEN_DETAILS.has(item.detailTypeId ?? "") ||
    HIDDEN_TITLE_RE.test(item.title)
  )
    return "occasional";
  if (
    item.categoryId === "kitchen_dishes" ||
    item.categoryId === "living_spaces" ||
    item.detailTypeId?.includes("dishwasher") ||
    item.detailTypeId?.includes("trash")
  )
    return "daily";
  if (item.categoryId === "laundry" || item.categoryId === "children_daily")
    return "frequent";
  if (
    item.categoryId === "floors" ||
    item.categoryId === "bathroom_toilets" ||
    item.categoryId === "cleaning_reset"
  )
    return "weekly";
  if (
    item.categoryId === "documents_admin" ||
    item.categoryId === "health_appointments" ||
    item.categoryId === "finances_bills"
  )
    return "monthly";
  return "occasional";
}

function inferVisibility(item: {
  categoryId: CategoryId;
  detailTypeId: string | null;
  title: string;
  cadence: DefaultCadence;
}): InitialVisibility {
  if (
    HIDDEN_DETAILS.has(item.detailTypeId ?? "") ||
    HIDDEN_TITLE_RE.test(item.title)
  )
    return "hidden";
  if (
    STARTER_DETAILS.has(item.detailTypeId ?? "") ||
    item.cadence === "daily" ||
    item.cadence === "frequent"
  )
    return "starter";
  return "learned";
}

export type CatalogItem = (typeof rawCatalog)[number] & {
  defaultCadence: DefaultCadence;
  initialVisibility: InitialVisibility;
};

export const enrichedCatalog: CatalogItem[] = rawCatalog.map((t) => {
  const cadence = inferCadence(t);
  return {
    ...t,
    defaultCadence: cadence,
    initialVisibility: inferVisibility({ ...t, cadence }),
  };
});

export function getStarterTemplates(profile: Profile): CatalogItem[] {
  return enrichedCatalog.filter((t) => {
    if (t.initialVisibility !== "starter") return false;
    if (t.requires && !profile[t.requires as keyof Profile]) return false;
    return true;
  });
}

export function shouldUseStarterMode(state: AppState): boolean {
  const learned =
    state.suggestionHistory.length +
    state.tasks.filter((t) => t.status === "done").length;
  return learned < 5;
}
