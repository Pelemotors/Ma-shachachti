import type { CategoryId } from "@/lib/taxonomy";

const TASK_EMOJI: Record<CategoryId, string> = {
  kitchen_dishes: "🍽️",
  cooking_meals: "🍲",
  fridge_pantry: "🧊",
  living_spaces: "🛋️",
  laundry: "🧺",
  clothing_closets: "👕",
  floors: "🧹",
  bathroom_toilets: "🚿",
  bedrooms_bedding: "🛏️",
  cleaning_reset: "✨",
  organization_storage: "📦",
  home_maintenance: "🔧",
  household_supplies: "🧻",
  garden_yard: "🌿",
  children_daily: "🧸",
  children_school: "🎒",
  children_activities: "⚽",
  family_logistics: "👨‍👩‍👧",
  guests_hosting: "🏠",
  pets: "🐾",
  shopping: "🛒",
  errands: "📍",
  health_appointments: "🩺",
  medications_tests: "💊",
  documents_admin: "📄",
  finances_bills: "💳",
  work_study: "💼",
  car: "🚗",
  travel_outings: "🧳",
  personal_care: "🪞",
  digital_devices: "💻",
  unclassified: "📌",
};

/** Ordered title-keyword rules — first match wins. Presentation only. */
const TITLE_KEYWORD_RULES: { keywords: string[]; emoji: string }[] = [
  { keywords: ["מדיח", "כלים", "צלחות"], emoji: "🍽️" },
  {
    keywords: ["לבשל", "ארוחה", "להכין אוכל", "הכנת אוכל", "אוכל"],
    emoji: "🍲",
  },
  { keywords: ["לטאטא", "לשטוף", "שטיפה", "ניקיון", "לנקות"], emoji: "🧹" },
  { keywords: ["כביסה"], emoji: "🧺" },
  { keywords: ["גינה", "גנן", "חצר"], emoji: "🌿" },
  { keywords: ["להתקשר", "טלפון", "שיחה"], emoji: "📞" },
  {
    keywords: ["אפליקציה", "באג", "באגים", "מחשב", "דיגיטל"],
    emoji: "💻",
  },
  { keywords: ["קניות"], emoji: "🛒" },
  { keywords: ["רכב"], emoji: "🚗" },
  { keywords: ["רופא", "תור"], emoji: "🩺" },
  { keywords: ["מסמכים", "מסמך"], emoji: "📄" },
  { keywords: ["ילדים", "ילד", "ילדה"], emoji: "🧸" },
];

/** Presentation-only emoji for a task category. Never persisted. */
export function emojiForCategory(categoryId: CategoryId | string): string {
  return TASK_EMOJI[categoryId as CategoryId] ?? TASK_EMOJI.unclassified;
}

/**
 * Presentation-only emoji for a task.
 * Priority: title keywords → categoryId → unclassified pin.
 * Never persisted / never changes categoryId.
 */
export function emojiForTask(
  title: string,
  categoryId: CategoryId | string,
): string {
  const normalized = title.trim().toLocaleLowerCase("he");
  if (normalized) {
    for (const rule of TITLE_KEYWORD_RULES) {
      if (rule.keywords.some((kw) => normalized.includes(kw.toLocaleLowerCase("he")))) {
        return rule.emoji;
      }
    }
  }
  return emojiForCategory(categoryId);
}
