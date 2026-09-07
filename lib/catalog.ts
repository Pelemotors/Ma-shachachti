import { Action, AppState } from "./model";
import { catalog } from "./catalog-data";
import {
  enrichedCatalog,
  getStarterTemplates,
  shouldUseStarterMode,
} from "./domain/starter";

export { catalog };

export function suggestions(s: AppState) {
  const base = shouldUseStarterMode(s)
    ? getStarterTemplates(s.profile)
    : enrichedCatalog.filter((t) => t.initialVisibility !== "hidden");
  return base.filter(
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
      categoryId: t.categoryId,
      detailTypeId: t.detailTypeId,
      classification: {
        source: "catalog",
        confidence: "high",
        userOverride: false,
      },
      enrichmentStatus: "done",
      workMinutes: t.workMinutes,
      waitMinutes: t.waitMinutes,
      effort: t.effort,
      templateId: t.id,
    },
  };
}

export { getStarterTemplates, shouldUseStarterMode, enrichedCatalog };
