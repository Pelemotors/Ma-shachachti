export const ADMIN_CONTROL_SECTIONS = [
  "overview",
  "events",
  "tests",
  "audit",
  "setup",
  "previews",
  "approvals",
  "rollback",
] as const;

export type AdminControlSection = (typeof ADMIN_CONTROL_SECTIONS)[number];

export const SMITH_FUTURE_SECTIONS = {
  previews: {
    title: "Preview Lab",
    status: "DISCONNECTED",
    summary:
      "לא הוגדר עדיין. אין Preview Provider ואין יצירת Preview אוטונומית.",
  },
  approvals: {
    title: "אישורי Production",
    status: "DISCONNECTED",
    summary: "לא הוגדר עדיין. ProductionExecutor כבוי ואין נתיב אישור פעיל.",
  },
  rollback: {
    title: "Rollback",
    status: "DISCONNECTED",
    summary: "לא הוגדר עדיין. אין יכולת rollback אוטונומית.",
  },
} as const;

export function isAdminControlSection(
  value: string,
): value is AdminControlSection {
  return (ADMIN_CONTROL_SECTIONS as readonly string[]).includes(value);
}

export function isSmithFutureSection(
  value: string,
): value is keyof typeof SMITH_FUTURE_SECTIONS {
  return value in SMITH_FUTURE_SECTIONS;
}
