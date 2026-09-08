export const SEASON_THEMES = ["spring", "summer", "autumn", "winter"] as const;

export type SeasonTheme = (typeof SEASON_THEMES)[number];

export type ThemeMode = "auto" | "fixed";

export type ThemeTokens = {
  primary: string;
  primaryLight: string;
  accent: string;
  accentSoft: string;
  text: string;
  muted: string;
  border: string;
  iconBg: string;
  iconColor: string;
  onPrimary: string;
};

export const THEME_TOKENS: Record<SeasonTheme, ThemeTokens> = {
  spring: {
    primary: "#517355",
    primaryLight: "#698868",
    accent: "#BB747B",
    accentSoft: "#F4E8E8",
    text: "#1E2B26",
    muted: "#667068",
    border: "#F1EDEA",
    iconBg: "#EEF3ED",
    iconColor: "#517355",
    onPrimary: "#FFFFFF",
  },
  summer: {
    primary: "#FBD766",
    primaryLight: "#F1D979",
    accent: "#866C22",
    accentSoft: "#F8EEBC",
    text: "#201D21",
    muted: "#6F6958",
    border: "#F2E8C5",
    iconBg: "#FAF1CD",
    iconColor: "#866C22",
    onPrimary: "#201D21",
  },
  autumn: {
    primary: "#A85A52",
    primaryLight: "#AC5E54",
    accent: "#6A453E",
    accentSoft: "#EBDDD5",
    text: "#1F1921",
    muted: "#756C6B",
    border: "#EBDDD5",
    iconBg: "#F3E7E2",
    iconColor: "#A85A52",
    onPrimary: "#FFFFFF",
  },
  winter: {
    primary: "#195194",
    primaryLight: "#3B79C2",
    accent: "#2A63A8",
    accentSoft: "#E2EAF4",
    text: "#0D1B36",
    muted: "#6F767E",
    border: "#E2EAF4",
    iconBg: "#EAF2FA",
    iconColor: "#195194",
    onPrimary: "#FFFFFF",
  },
};

export const THEME_LABELS: Record<SeasonTheme, string> = {
  spring: "אביב",
  summer: "קיץ",
  autumn: "סתיו",
  winter: "חורף",
};

/** Month 1–12 → season (Northern hemisphere). */
export function seasonFromMonth(month: number): SeasonTheme {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

export function themeBackgroundUrl(theme: SeasonTheme): string {
  return `/themes/${theme}.webp`;
}
