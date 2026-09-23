export const V4 = {
  canvas: 390,
  page: "#F5F2ED",
  card: "#FEFDFB",
  text: "#271F1D",
  muted: "#8A857C",
  time: "#6F6A64",
  sage: "#627663",
  sageSoft: "#9CAC98",
  sageDeep: "#53685C",
  track: "#E6E2DA",
  border: "#EDE8E1",
  shadow: "#D4CCC2",
  composer: "#FAF9F5",
  placeholder: "#9A958C",
  dot: "#E35D5A",
  checkbox: "#C9C3BA",
  navMuted: "#8A8B8D",
  tileBlue: "#D4E3EE",
  tilePeach: "#F1E3D8",
  tileLilac: "#E4DFF0",
  tileGreen: "#D7E4D6",
  heroWash: "#EEF0E8",
  fonts: {
    regular: "Heebo_400Regular",
    medium: "Heebo_500Medium",
    semibold: "Heebo_600SemiBold",
    bold: "Heebo_700Bold",
    extraBold: "Heebo_800ExtraBold",
  },
} as const;

export function homeScale(width: number) {
  return width / V4.canvas;
}

export function heebo(weight: "400" | "500" | "600" | "700" | "800") {
  if (weight === "800") return V4.fonts.extraBold;
  if (weight === "700") return V4.fonts.bold;
  if (weight === "600") return V4.fonts.semibold;
  if (weight === "500") return V4.fonts.medium;
  return V4.fonts.regular;
}
