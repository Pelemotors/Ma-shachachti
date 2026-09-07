export const CATEGORY_GROUPS = [
  "home",
  "family",
  "personal_admin",
  "mobility_life",
  "other",
] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];

export const TASK_CATEGORIES = [
  { id: "kitchen_dishes", label: "מטבח / כלים", group: "home", order: 1 },
  { id: "cooking_meals", label: "אוכל / בישול", group: "home", order: 2 },
  { id: "fridge_pantry", label: "מקרר / מזווה", group: "home", order: 3 },
  {
    id: "living_spaces",
    label: "סלון / אזורי מגורים",
    group: "home",
    order: 4,
  },
  { id: "laundry", label: "כביסה", group: "home", order: 5 },
  { id: "clothing_closets", label: "בגדים / ארונות", group: "home", order: 6 },
  { id: "floors", label: "רצפות", group: "home", order: 7 },
  { id: "bathroom_toilets", label: "מקלחת / שירותים", group: "home", order: 8 },
  {
    id: "bedrooms_bedding",
    label: "חדרי שינה / מצעים",
    group: "home",
    order: 9,
  },
  {
    id: "cleaning_reset",
    label: "ניקיון / איפוס בית",
    group: "home",
    order: 10,
  },
  {
    id: "organization_storage",
    label: "סדר / אחסון",
    group: "home",
    order: 11,
  },
  {
    id: "home_maintenance",
    label: "תחזוקת הבית / תיקונים",
    group: "home",
    order: 12,
  },
  {
    id: "household_supplies",
    label: "ציוד / מלאי לבית",
    group: "home",
    order: 13,
  },
  { id: "garden_yard", label: "גינה / חצר", group: "home", order: 14 },
  { id: "children_daily", label: "ילדים / שגרה", group: "family", order: 15 },
  { id: "children_school", label: "גן / בית ספר", group: "family", order: 16 },
  {
    id: "children_activities",
    label: "חוגים / פעילויות",
    group: "family",
    order: 17,
  },
  {
    id: "family_logistics",
    label: "משפחה / תיאומים",
    group: "family",
    order: 18,
  },
  { id: "guests_hosting", label: "אירוח / אורחים", group: "family", order: 19 },
  { id: "pets", label: "חיות מחמד", group: "family", order: 20 },
  { id: "shopping", label: "קניות", group: "personal_admin", order: 21 },
  {
    id: "errands",
    label: "סידורים / שליחויות",
    group: "personal_admin",
    order: 22,
  },
  {
    id: "health_appointments",
    label: "בריאות / תורים",
    group: "personal_admin",
    order: 23,
  },
  {
    id: "medications_tests",
    label: "תרופות / בדיקות",
    group: "personal_admin",
    order: 24,
  },
  {
    id: "documents_admin",
    label: "מסמכים / אדמיניסטרציה",
    group: "personal_admin",
    order: 25,
  },
  {
    id: "finances_bills",
    label: "כספים / חשבונות",
    group: "personal_admin",
    order: 26,
  },
  {
    id: "work_study",
    label: "עבודה / לימודים",
    group: "personal_admin",
    order: 27,
  },
  { id: "car", label: "רכב", group: "mobility_life", order: 28 },
  {
    id: "travel_outings",
    label: "נסיעות / יציאות / חופשות",
    group: "mobility_life",
    order: 29,
  },
  {
    id: "personal_care",
    label: "אישי / טיפוח",
    group: "mobility_life",
    order: 30,
  },
  {
    id: "digital_devices",
    label: "דיגיטל / מכשירים",
    group: "mobility_life",
    order: 31,
  },
  { id: "unclassified", label: "שונות / לא מסווג", group: "other", order: 32 },
] as const;

export type CategoryId = (typeof TASK_CATEGORIES)[number]["id"];

export const CATEGORY_IDS = TASK_CATEGORIES.map((c) => c.id) as [
  CategoryId,
  ...CategoryId[],
];

export const categoryById = Object.fromEntries(
  TASK_CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryId, (typeof TASK_CATEGORIES)[number]>;

export const LEGACY_DIRECT_MAP: Record<string, CategoryId> = {
  סלון: "living_spaces",
  רצפות: "floors",
  "מקלחת ושירותים": "bathroom_toilets",
  מצעים: "bedrooms_bedding",
  "גינה וחצר": "garden_yard",
  קניות: "shopping",
  "חיות מחמד": "pets",
  רכב: "car",
  "איפוס בית": "cleaning_reset",
};

/** Legacy 15 flat labels → best-effort V2 category (title heuristics apply on top). */
export function classifyLegacyCategory(
  legacyCategory: string,
  title: string,
  templateId?: string | null,
): CategoryId {
  const t = title.toLowerCase();
  const direct = LEGACY_DIRECT_MAP[legacyCategory];
  if (direct) return direct;

  if (legacyCategory === "מטבח") {
    if (/מקרר|מקפיא|מזווה|תוקף/.test(t)) return "fridge_pantry";
    if (/לבשל|לאפות|ארוחת|פשטידה|מתכון|להכין אוכל|לחתוך/.test(t))
      return "cooking_meals";
    return "kitchen_dishes";
  }
  if (legacyCategory === "כביסה") {
    if (/ארון|בגדים|קיץ|חורף|מיון בגדים/.test(t)) return "clothing_closets";
    return "laundry";
  }
  if (legacyCategory === "ילדים") {
    if (/גן|בית ספר|מורה|גננת|אסיפת/.test(t)) return "children_school";
    if (/חוג|אימון|פעילות|יום הולדת/.test(t)) return "children_activities";
    return "children_daily";
  }
  if (legacyCategory === "בריאות ותורים") {
    if (/תרופה|בדיקה|מרשם/.test(t)) return "medications_tests";
    return "health_appointments";
  }
  if (legacyCategory === "מסמכים ואדמיניסטרציה") {
    if (/תשלום|חיוב|בנק|החזר|תקציב/.test(t)) return "finances_bills";
    return "documents_admin";
  }
  if (legacyCategory === "שונות / לא מסווג") return "unclassified";
  void templateId;
  return "unclassified";
}

export function categoryLabel(id: CategoryId): string {
  return categoryById[id]?.label ?? categoryById.unclassified.label;
}

export function getCategory(id: CategoryId) {
  return categoryById[id] ?? categoryById.unclassified;
}

export function getCategoryLabel(id: CategoryId): string {
  return categoryLabel(id);
}

export function isCategory(id: string): id is CategoryId {
  return (CATEGORY_IDS as readonly string[]).includes(id);
}

export function getCategoryGroup(id: CategoryId) {
  return getCategory(id).group;
}

export function groupTasksByCategory<T extends { categoryId: CategoryId }>(
  tasks: T[],
): Map<CategoryId, T[]> {
  const map = new Map<CategoryId, T[]>();
  for (const task of tasks) {
    const list = map.get(task.categoryId) ?? [];
    list.push(task);
    map.set(task.categoryId, list);
  }
  return map;
}
