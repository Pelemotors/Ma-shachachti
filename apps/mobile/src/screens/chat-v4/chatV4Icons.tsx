import { Image, type ImageStyle, type StyleProp } from "react-native";
import { HomeV4Icon, type HomeV4IconName } from "../home-v4/homeV4Icons";

const LOCAL = {
  sparkle: require("../../../assets/home-v4/icons/sparkle.png"),
  mic: require("../../../assets/home-v4/icons/mic.png"),
  send: require("../../../assets/home-v4/icons/sparkle.png"),
  cart: require("../../../assets/home-v4/icons/cart.png"),
  calendar: require("../../../assets/home-v4/icons/calendar.png"),
  tasks: require("../../../assets/home-v4/icons/tasks.png"),
} as const;

export function ChatV4Png({
  name,
  size,
  color,
  style,
}: {
  name: keyof typeof LOCAL;
  size: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={LOCAL[name]}
      style={[{ width: size, height: size, tintColor: color }, style]}
      resizeMode="contain"
    />
  );
}

export function ChatSharedIcon({
  name,
  size,
  color,
}: {
  name: HomeV4IconName;
  size: number;
  color?: string;
}) {
  return <HomeV4Icon name={name} size={size} color={color} />;
}
