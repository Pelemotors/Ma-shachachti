/** Official Home Design Lock — 390×844. Do not invent geometry. */
export const HOME_REF = {
  w: 390,
  h: 844,
  status: 44,
} as const;

export function homeFrame(width: number, height: number) {
  const s = Math.min(width / HOME_REF.w, height / HOME_REF.h);
  const ox = (width - HOME_REF.w * s) / 2;
  const oy = (height - HOME_REF.h * s) / 2;
  return { s, ox, oy };
}

export const HOME_BOX = {
  tagline: { x: 133, y: 44, w: 123, h: 34 },
  greeting: { x: 120, y: 90, w: 161, h: 41 },
  botanical: { x: 3, y: 14, w: 120, h: 223 },
  branchTopLeft: { x: 3, y: 14, w: 120, h: 223 },
  branchBottomRight: { x: 248, y: 318, w: 140, h: 178 },
  hero: { x: 47, y: 143, w: 305, h: 263 },
  top: { x: 114, y: 144, w: 172, h: 106 },
  left: { x: 48, y: 216, w: 106, h: 189 },
  right: { x: 248, y: 216, w: 104, h: 187 },
  center: { x: 121, y: 218, w: 154, h: 154, d: 154 },
  nowCard: { x: 21, y: 417, w: 359, h: 244, radius: 28 },
  nowTitle: { y: 16, h: 27 },
  nowCaption: { y: 42, h: 18 },
  progress: { x: 20, y: 64, w: 322, h: 10 },
  row1: { x: 10, y: 94, w: 338, h: 53 },
  row2: { x: 10, y: 153, w: 338, h: 53 },
  chevron: { x: 192, y: 623, w: 22, h: 23 },
  bank: { x: 125, y: 648, w: 151, h: 48 },
  composer: { x: 21, y: 701, w: 359, h: 67 },
  nav: { x: 1, y: 772, w: 389, h: 72 },
} as const;

export const HOME_COLOR = {
  page: "#FBF4EE",
  surface: "#FFFDFC",
  tagline: "#8A7970",
  text: "#342B28",
  petalTop: "#FBECDF",
  petalLeft: "#E5E1D8",
  petalRight: "#F3DDD4",
  center: "#A66B59",
  nowCard: "#F4EBE3",
  row: "#FFFDFC",
  muted: "#8A7970",
  progress: "#B97863",
  track: "#E8D7CB",
  navSelected: "#F7DED5",
} as const;

export const HOME_TYPE = {
  tagline: { size: 14, line: 20, weight: "400" as const },
  greeting: { size: 29, line: 36, weight: "700" as const },
  heroLabel: { size: 15, line: 19, weight: "600" as const },
  centerLabel: { size: 18, line: 23, weight: "700" as const },
  sectionTitle: { size: 21, line: 27, weight: "700" as const },
  sectionMeta: { size: 13, line: 18, weight: "400" as const },
  task: { size: 15, line: 20, weight: "500" as const },
  time: { size: 13, line: 18, weight: "400" as const },
  bank: { size: 15, line: 20, weight: "500" as const },
  composer: { size: 14, line: 20, weight: "400" as const },
  nav: { size: 11, line: 14, weight: "500" as const },
} as const;
