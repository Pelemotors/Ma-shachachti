import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { HOME_BOX, HOME_COLOR, HOME_TYPE } from "../../product/homeGeometry";

const HERO_IMG = {
  top: require("../../../assets/ui/hero-top.png"),
  left: require("../../../assets/ui/hero-left.png"),
  right: require("../../../assets/ui/hero-right.png"),
  center: require("../../../assets/ui/hero-center.png"),
} as const;

type Petal = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type Lobe = "top" | "left" | "right";

const CONTENT: Record<Lobe, { left: number; top: number; w: number }> = {
  top: { left: 36, top: 18, w: 100 },
  left: { left: 8, top: 46, w: 90 },
  right: { left: 6, top: 46, w: 92 },
};

export function HeroPetalActions({
  scale,
  originX,
  originY,
  centerLabel = "מה שכחתי?",
  onCenter,
  petals,
  onPetal,
}: {
  scale: number;
  originX: number;
  originY: number;
  centerLabel?: string;
  onCenter: () => void;
  petals: Petal[];
  onPetal: (id: string) => void;
}) {
  const s = scale;
  const top = petals[0];
  const left = petals[1];
  const right = petals[2];
  const c = HOME_BOX.center;
  const d = Math.min(c.w, c.h);

  return (
    <View style={{ width: HOME_BOX.hero.w * s, height: HOME_BOX.hero.h * s, overflow: "visible" }}>
      {top ? <LockPetal lobe="top" originX={originX} originY={originY} scale={s} petal={top} onPress={() => onPetal(top.id)} /> : null}
      {left ? <LockPetal lobe="left" originX={originX} originY={originY} scale={s} petal={left} onPress={() => onPetal(left.id)} /> : null}
      {right ? (
        <LockPetal lobe="right" originX={originX} originY={originY} scale={s} petal={right} onPress={() => onPetal(right.id)} />
      ) : null}
      <Pressable
        onPress={onCenter}
        accessibilityLabel={centerLabel}
        style={{
          position: "absolute",
          width: d * s,
          height: d * s,
          left: (c.x - originX + (c.w - d) / 2) * s,
          top: (c.y - originY + (c.h - d) / 2) * s,
          zIndex: 3,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Image
          source={HERO_IMG.center}
          style={{ position: "absolute", width: d * s, height: d * s }}
          resizeMode="contain"
        />
        <Ionicons name="sparkles" size={Math.round(18 * s)} color="#FFFDFC" />
        <Text
          style={[
            styles.centerLabel,
            { fontSize: HOME_TYPE.centerLabel.size * s, lineHeight: HOME_TYPE.centerLabel.line * s, marginTop: 4 * s },
          ]}
        >
          {centerLabel}
        </Text>
      </Pressable>
    </View>
  );
}

function LockPetal({
  lobe,
  originX,
  originY,
  scale,
  petal,
  onPress,
}: {
  lobe: Lobe;
  originX: number;
  originY: number;
  scale: number;
  petal: Petal;
  onPress: () => void;
}) {
  const s = scale;
  const box = HOME_BOX[lobe];
  const content = CONTENT[lobe];
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={petal.label}
      style={{
        position: "absolute",
        left: (box.x - originX) * s,
        top: (box.y - originY) * s,
        width: box.w * s,
        height: box.h * s,
        overflow: "hidden",
        zIndex: 1,
      }}
    >
      <Image source={HERO_IMG[lobe]} style={{ width: box.w * s, height: box.h * s }} resizeMode="stretch" />
      <View
        style={{
          position: "absolute",
          left: content.left * s,
          top: content.top * s,
          width: content.w * s,
          alignItems: "center",
        }}
      >
        <Ionicons name={petal.icon} size={Math.round(24 * s)} color={HOME_COLOR.text} />
        <Text
          style={[
            styles.petalLabel,
            { fontSize: HOME_TYPE.heroLabel.size * s, lineHeight: HOME_TYPE.heroLabel.line * s, marginTop: 6 * s },
          ]}
        >
          {petal.label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centerLabel: {
    color: "#FFFDFC",
    fontWeight: "700",
    textAlign: "center",
  },
  petalLabel: {
    textAlign: "center",
    color: HOME_COLOR.text,
    fontWeight: "600",
  },
});
