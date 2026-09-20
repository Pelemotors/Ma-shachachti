import { colors } from "./colors";

export const type = {
  greeting: { fontSize: 22, fontWeight: "700" as const, lineHeight: 28, color: colors.text },
  title: { fontSize: 26, fontWeight: "700" as const, lineHeight: 32, color: colors.text },
  section: { fontSize: 16, fontWeight: "600" as const, lineHeight: 22, color: colors.text },
  body: { fontSize: 15, fontWeight: "400" as const, lineHeight: 22, color: colors.text },
  caption: { fontSize: 12, fontWeight: "400" as const, lineHeight: 16, color: colors.textMuted },
  cta: { fontSize: 16, fontWeight: "600" as const, lineHeight: 20, color: colors.onAccent },
  nav: { fontSize: 11, fontWeight: "500" as const, lineHeight: 14 },
} as const;

export const rtlText = {
  textAlign: "right" as const,
};
