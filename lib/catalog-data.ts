import data from "./catalog.json";
import { CategoryId, classifyLegacyCategory } from "./taxonomy";

type CatalogRaw = {
  id: string;
  title: string;
  category?: string;
  legacyCategory?: string;
  categoryId?: CategoryId;
  detailTypeId?: string | null;
  workMinutes: number;
  waitMinutes: number;
  effort: number;
  requires: string | null;
};

/** Raw catalog rows — no domain imports (avoids starter↔catalog cycles). */
export const catalog = (data as CatalogRaw[]).map((t) => {
  const categoryId =
    t.categoryId ??
    classifyLegacyCategory(
      t.legacyCategory ?? t.category ?? "שונות / לא מסווג",
      t.title,
      t.id,
    );
  return {
    id: t.id,
    title: t.title,
    categoryId,
    detailTypeId: t.detailTypeId ?? null,
    workMinutes: t.workMinutes,
    waitMinutes: t.waitMinutes,
    effort: t.effort,
    requires: t.requires,
  };
});
