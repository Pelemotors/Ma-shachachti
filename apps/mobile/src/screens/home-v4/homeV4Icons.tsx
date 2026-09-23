import { Image, type ImageStyle, type StyleProp } from "react-native";

const ICONS = {
  bell: require("../../../assets/home-v4/icons/bell.png"),
  calendar: require("../../../assets/home-v4/icons/calendar.png"),
  clock: require("../../../assets/home-v4/icons/clock.png"),
  cart: require("../../../assets/home-v4/icons/cart.png"),
  checklist: require("../../../assets/home-v4/icons/checklist.png"),
  mic: require("../../../assets/home-v4/icons/mic.png"),
  sparkle: require("../../../assets/home-v4/icons/sparkle.png"),
  home: require("../../../assets/home-v4/icons/home.png"),
  "home-active": require("../../../assets/home-v4/icons/home-active.png"),
  chat: require("../../../assets/home-v4/icons/chat.png"),
  tasks: require("../../../assets/home-v4/icons/tasks.png"),
  package: require("../../../assets/home-v4/icons/package.png"),
  chevron: require("../../../assets/home-v4/icons/chevron.png"),
  dots: require("../../../assets/home-v4/icons/dots.png"),
  heart: require("../../../assets/home-v4/icons/heart.png"),
} as const;

export type HomeV4IconName = keyof typeof ICONS;

export function HomeV4Icon({
  name,
  size,
  color,
  style,
}: {
  name: HomeV4IconName;
  size: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={ICONS[name]}
      style={[{ width: size, height: size, tintColor: color }, style]}
      resizeMode="contain"
    />
  );
}
