"use client";
import type { ReactNode } from "react";
import type { AppView } from "@/hooks/app-view";

export type { AppView };

export const VIEW_TITLES: Record<AppView, string> = {
  home: "הבית שלך",
  chat: "אני כאן איתך",
  tasks: "המשימות שלי",
  shopping: "רשימת קניות",
  memory: "מה אני זוכר",
  settings: "הבית וההעדפות",
  reminders: "תזכורות",
  kit: "מתאים לבית שלכם?",
  history: "מה כבר נעשה",
  focus: "מה שכחתי?",
  plan: "נעשה סדר ביום",
  free: "זמן בשביל מה שמתאים",
};

/** @deprecated Use VIEW_TITLES */
export const viewTitles = VIEW_TITLES;

export function ViewHeader({
  children,
  view,
  title,
}: {
  children?: ReactNode;
  view?: AppView;
  title?: string;
}) {
  const heading = title ?? (view ? VIEW_TITLES[view] : "");
  return (
    <div className="section-heading">
      <h2>{heading}</h2>
      {children}
    </div>
  );
}
