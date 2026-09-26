import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from "react-native-svg";
import { FLOWER } from "./flowerGeometry";
import { flowerTokens as T } from "./flowerTokens";
import { heebo } from "./homeV4Theme";

type Props = {
  width: number;
  onCreatePlan: () => void;
  onFreeTime: () => void;
  onChecklists: () => void;
  onForgot: () => void;
};

export function HomeFlowerActions({
  width,
  onCreatePlan,
  onFreeTime,
  onChecklists,
  onForgot,
}: Props) {
  const s = width / FLOWER.width;
  const height = FLOWER.height * s;

  const label = (
    _key: "top" | "left" | "right" | "center",
    text: string,
    x: number,
    y: number,
    boxWidth: number,
    fontSize: number,
    lineHeight: number,
    color: string = T.dark,
  ) => (
    <Text
      pointerEvents="none"
      style={[
        styles.label,
        {
          left: (x - boxWidth / 2) * s,
          top: (y - lineHeight / 2) * s,
          width: boxWidth * s,
          fontSize: fontSize * s,
          lineHeight: lineHeight * s,
          color,
        },
      ]}
    >
      {text}
    </Text>
  );

  const icon = (name: keyof typeof FLOWER.icons, color: string) => {
    const i = FLOWER.icons[name];
    const [x,y,w,h] = i.masterPosition;
    return (
      <G transform={`translate(${x} ${y})`}>
        <Path d={i.path} fill={color} fillRule="evenodd" />
      </G>
    );
  };

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${FLOWER.width} ${FLOWER.height}`}>
        <Defs>
          <LinearGradient id="centerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={T.centerGradientStart} />
            <Stop offset="100%" stopColor={T.centerGradientEnd} />
          </LinearGradient>
        </Defs>

        {/* Exact traced visual geometry. Do not replace with rounded Views. */}
        <Path d={FLOWER.paths.top} fill={T.topFill} stroke={T.petalStroke} strokeWidth={T.petalStrokeWidth} />
        <Path d={FLOWER.paths.left} fill={T.leftFill} stroke={T.petalStroke} strokeWidth={T.petalStrokeWidth} />
        <Path d={FLOWER.paths.right} fill={T.rightFill} stroke={T.petalStroke} strokeWidth={T.petalStrokeWidth} />

        {/* Center ring MUST be drawn after petals to mask their inner edges. */}
        <Circle cx={FLOWER.center.cx} cy={FLOWER.center.cy} r={FLOWER.center.outerRadius} fill={T.centerRing} />
        <Circle cx={FLOWER.center.cx} cy={FLOWER.center.cy} r={FLOWER.center.innerRadius} fill="url(#centerGradient)" />

        {icon("calendar", T.dark)}
        {icon("clock", T.dark)}
        {icon("checklist", T.dark)}
        {icon("sparkle", "#FFFFFF")}
      </Svg>

      {/* Native labels: keep accessible/localizable; align against reference ink boxes. */}
      {label("top", "צור לי לו״ז", 282.5, 137.5, 150, 28, 34)}
      {label("left", "יש לי\nזמן פנוי", 97.5, 323.5, 120, 27, 32)}
      {label("right", "צ׳קליסטים", 473, 323, 135, 28, 34)}
      {label("center", "מה שכחתי?", 282.5, 311, 180, 30, 36, T.centerText)}

      {/* Large accessible hit targets. Visuals stay SVG; these overlays only receive touches. */}
      <Pressable accessibilityRole="button" accessibilityLabel="צור לי לו״ז" onPress={onCreatePlan}
        style={[styles.hit, { left: 131*s, top: 19*s, width: 300*s, height: 179*s }]} />
      <Pressable accessibilityRole="button" accessibilityLabel="יש לי זמן פנוי" onPress={onFreeTime}
        style={[styles.hit, { left: 16*s, top: 146*s, width: 169*s, height: 289*s }]} />
      <Pressable accessibilityRole="button" accessibilityLabel="צ׳קליסטים" onPress={onChecklists}
        style={[styles.hit, { left: 375*s, top: 143*s, width: 176*s, height: 295*s }]} />
      <Pressable accessibilityRole="button" accessibilityLabel="מה שכחתי?" onPress={onForgot}
        style={[styles.hit, { left: 159.5*s, top: 175.5*s, width: 242*s, height: 242*s, borderRadius: 121*s }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    position: "absolute",
    fontFamily: heebo("500"),
    fontWeight: "500",
    textAlign: "center",
    writingDirection: "rtl",
    includeFontPadding: false,
  },
  hit: {
    position: "absolute",
    backgroundColor: "transparent",
  },
});
