export { colors } from "./colors";
export { radius, space } from "./spacing";
export { rtlText, type } from "./typography";

export const elevation = {
  card: {
    shadowColor: "#3A2F28",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
} as const;
