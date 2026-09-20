/**
 * Dev-only Home visual fixture. Never persisted, never sent to an API,
 * compiled out of production (`__DEV__` is false in release).
 */
export const HOME_QA_FIXTURE_ENABLED = __DEV__;

export const homeQaNow = {
  greeting: "בוקר טוב, אירה.",
  tagline: "הבית שלך, בקצב שלך",
  done: 3,
  total: 8,
  caption: "משימות בוצעו",
  upcoming: [
    { id: "qa-home-1", time: "16:30", title: "להכין ארוחת ערב", icon: "restaurant-outline" as const },
    { id: "qa-home-2", time: "17:15", title: "לאסוף הילדים מהגן", icon: "people-outline" as const },
  ],
};
