import { Image, StyleSheet, View } from "react-native";

const LEFT_TOP = require("../../../assets/home-master-v2/botanical-left-top-master-v2.png");
const LEFT_MID = require("../../../assets/home-master-v2/botanical-left-mid-master.png");
const RIGHT = require("../../../assets/home-master-v2/botanical-right-blur-master-v2.png");

const BOTANICALS = [
  { source: LEFT_TOP, x: 8, y: 28, width: 179, height: 275 },
  { source: LEFT_MID, x: 0, y: 230, width: 75, height: 310 },
  { source: RIGHT, x: 684, y: 220, width: 72, height: 185 },
] as const;

export function HomeMasterBackdrop({ width, height }: { width: number; height: number }) {
  const scale = width / 756;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
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
