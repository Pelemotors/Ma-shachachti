import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const modelDir = path.join(root, "lib", "model");
fs.mkdirSync(modelDir, { recursive: true });

const common = `import { z } from "zod";
import { CATEGORY_IDS } from "../taxonomy";

export const legacyCategories = [
  "מטבח",
  "סלון",
  "כביסה",
  "רצפות",
  "מקלחת ושירותים",
  "מצעים",
  "ילדים",
  "גינה וחצר",
  "קניות",
  "חיות מחמד",
  "רכב",
  "בריאות ותורים",
  "מסמכים ואדמיניסטרציה",
  "איפוס בית",
  "שונות / לא מסווג",
] as const;

/** @deprecated Prefer CategoryId from taxonomy — kept for catalog typing during transition */
export const categories = legacyCategories;
export const CategorySchema = z.enum(CATEGORY_IDS);
export const LegacyCategorySchema = z.enum(legacyCategories);

export const StatusSchema = z.enum([
  "open",
  "done",
  "cancelled",
  "unknown",
  "in_progress",
]);
export const ReminderUrgencySchema = z.enum(["urgent", "medium", "low"]);
export const Stamp = z.string().datetime({ offset: true });
export const DateKey = z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/);

export function normalize(s: string) {
  return s
    .normalize("NFKC")
    .replace(/[\\u0591-\\u05C7]/g, "")
    .replace(/[^\\p{L}\\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}
`;

fs.writeFileSync(path.join(modelDir, "common.ts"), common);
console.log("wrote common.ts");
