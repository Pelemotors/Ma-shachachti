import { Image, StyleSheet, View } from "react-native";

const BASE = require("../../../assets/home-master/background/base-cream.png");
const BRANCH = require("../../../assets/home-master/background/branch-left.png");
const RIGHT = require("../../../assets/home-master/background/blur-leaf-right.png");
const LEFT_MID = require("../../../assets/home-master/background/blur-leaf-left-mid.png");
const LOWER_LEFT = require("../../../assets/home-master/background/blur-leaf-lower-left.png");

const BOTANICALS = [
  { source: BRANCH, x: 20, y: 20, width: 250, height: 610 },
  { source: RIGHT, x: 604, y: 170, width: 160, height: 360 },
  { source: LEFT_MID, x: 0, y: 350, width: 180, height: 250 },
  { source: LOWER_LEFT, x: 0, y: 540, width: 250, height: 360 },
] as const;

export function HomeMasterBackdrop({ width, height }: { width: number; height: number }) {
  const scale = width / 756;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image source={BASE} resizeMode="stretch" style={{ width, height }} />
      {BOTANICALS.map((asset) => (
        <Image
          key={asset.x + asset.y}
          source={asset.source}
          resizeMode="contain"
          style={{
            position: "absolute",
            left: asset.x * scale,
            top: asset.y * scale,
            width: asset.width * scale,
            height: asset.height * scale,
          }}
        />
      ))}
    </View>
  );
}
