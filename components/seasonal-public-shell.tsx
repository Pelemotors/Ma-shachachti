import type { ReactNode } from "react";
import type { SeasonTheme } from "@/lib/theme-config";

/** Public/auth screens outside app-shell — same seasonal surface language. */
export function SeasonalPublicShell(props: {
  children: ReactNode;
  theme?: SeasonTheme;
  className?: string;
}) {
  return (
    <div
      className={
        "seasonal-public-shell" + (props.className ? ` ${props.className}` : "")
      }
      data-theme={props.theme ?? "spring"}
    >
      {props.children}
    </div>
  );
}
