import { Image, StyleSheet, View } from "react-native";

const LEFT_TOP = require("../../../assets/checklists-v1/background/botanical-left-top-master-v2.png");
const LEFT_MID = require("../../../assets/checklists-v1/background/botanical-left-mid-master.png");
const RIGHT = require("../../../assets/checklists-v1/background/botanical-right-blur-master-v2.png");

export function BotanicalBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image source={LEFT_TOP} resizeMode="contain" style={[styles.leaf, { top: 8, right: -18, width: 168, height: 220, opacity: 0.34 }]} />
      <Image source={LEFT_MID} resizeMode="contain" style={[styles.leaf, { top: 240, right: -8, width: 72, height: 260, opacity: 0.22 }]} />
      <Image source={RIGHT} resizeMode="contain" style={[styles.leaf, { top: 210, left: -6, width: 78, height: 190, opacity: 0.2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  leaf: { position: "absolute" },
});
