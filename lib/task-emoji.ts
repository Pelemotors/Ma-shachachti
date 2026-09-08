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

/** Presentation-only emoji for a task category. Never persisted. */
export function emojiForCategory(categoryId: CategoryId | string): string {
  return TASK_EMOJI[categoryId as CategoryId] ?? TASK_EMOJI.unclassified;
}
