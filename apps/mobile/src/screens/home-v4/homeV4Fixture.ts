/**
 * Dev-only Home V4 visual fixture. Compiled out of production
 * (`__DEV__` is false in release). Never persisted, never sent to an API.
 */
export const HOME_V4_VISUAL_QA = false;

export const homeV4Fixture = {
  greeting: "בוקר טוב",
  subtitle: "בואי נעשה סדר בראש",
  done: 3,
  total: 8,
  rows: [
    { id: "v4-qa-1", time: "16:30", title: "להכין ארוחת ערב", icon: "package" as const },
    { id: "v4-qa-2", time: "17:15", title: "איסוף הילדים מהגן", icon: "people" as const },
  ],
  reminderTitle: "החזרת החבילה עד 18:00",
};
