import data from "./catalog.json";
import { AppState, categories, Action } from "./model";
export const catalog = data.map((t) => ({
  ...t,
  category: t.category as (typeof categories)[number],
}));
export function suggestions(s: AppState) {
  return catalog.filter(
    (t) =>
      !s.excludedTemplates.includes(t.id) &&
      !s.tasks.some((x) => x.templateId === t.id) &&
      (!t.requires || !!s.profile[t.requires as keyof typeof s.profile]),
  );
}
export function templateAction(id: string): Action {
  const t = catalog.find((t) => t.id === id);
  if (!t) throw new Error("הצעה לא נמצאה");
  return {
    type: "task.create",
    task: {
      title: t.title,
      category: t.category,
      workMinutes: t.workMinutes,
      waitMinutes: t.waitMinutes,
      effort: t.effort,
      templateId: t.id,
    },
  };
}
