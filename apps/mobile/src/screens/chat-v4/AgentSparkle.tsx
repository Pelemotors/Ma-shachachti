import { View } from "react-native";
import { HomeV4Icon } from "../home-v4/homeV4Icons";

export function AgentSparkle({ size }: { size: number }) {
  return (
    <View accessibilityElementsHidden>
      <HomeV4Icon name="sparkle" size={size} color="#C4A090" />
    </View>
  );
}
