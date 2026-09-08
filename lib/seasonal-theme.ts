import {
  seasonFromMonth,
  type SeasonTheme,
  type ThemeMode,
} from "@/lib/theme-config";

export type ResolveActiveThemeInput = {
  mode: ThemeMode;
  fixed: SeasonTheme;
  clock: Date;
  timezone: string;
};

/** Resolve UI theme from profile preference + local calendar month in profile timezone. */
export function resolveActiveTheme(input: ResolveActiveThemeInput): SeasonTheme {
  if (input.mode === "fixed") return input.fixed;

  const monthParts = new Intl.DateTimeFormat("en-US", {
    timeZone: input.timezone,
    month: "numeric",
  }).formatToParts(input.clock);
  const month = Number(
    monthParts.find((p) => p.type === "month")?.value ??
      input.clock.getMonth() + 1,
  );
  return seasonFromMonth(month);
}
