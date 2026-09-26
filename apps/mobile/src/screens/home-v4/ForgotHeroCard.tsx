import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { heebo, V4 } from "./homeV4Theme";

const HERO = require("../../../assets/home-v4/hero-background.png");

export function ForgotHeroCard({
  scale,
  onOpenForgot,
}: {
  scale: number;
  onOpenForgot: () => void;
}) {
  const s = scale;
  return (
    <ImageBackground
      source={HERO}
      resizeMode="cover"
      style={[
        styles.card,
        {
          marginHorizontal: 16 * s,
          height: 120 * s,
          borderRadius: 28 * s,
        },
      ]}
      imageStyle={{ borderRadius: 28 * s }}
    >
      <View style={[styles.copy, { top: 12 * s, right: 16 * s, left: 118 * s }]}>
        <Pressable onPress={onOpenForgot} accessibilityLabel="מה שכחתי?">
        <Text
          style={{
            fontFamily: heebo("700"),
            fontSize: 26 * s,
            lineHeight: 32 * s,
            color: V4.text,
            textAlign: "right",
          }}
        >
          מה שכחתי?
        </Text>
        </Pressable>
        <Text
          style={{
            fontFamily: heebo("400"),
            fontSize: 12 * s,
            lineHeight: 16 * s,
            color: V4.muted,
            textAlign: "right",
            marginTop: 4 * s,
          }}
        >
          נסרוק יחד מה פתוח ומה דורש תשומת לב
        </Text>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  card: { overflow: "hidden", backgroundColor: V4.heroWash },
  copy: { position: "absolute" },
});
