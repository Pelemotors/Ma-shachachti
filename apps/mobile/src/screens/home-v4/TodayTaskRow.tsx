import { Pressable, StyleSheet, Text, View } from "react-native";
import { HomeV4Icon, type HomeV4IconName } from "./homeV4Icons";
import { heebo, V4 } from "./homeV4Theme";

export function TodayTaskRow({
  scale,
  time,
  title,
  icon,
  onToggle,
}: {
  scale: number;
  time: string;
  title: string;
  icon: HomeV4IconName;
  onToggle: () => void;
}) {
  const s = scale;
  const chip =
    icon === "cart" ? V4.tileGreen : icon === "calendar" ? V4.tileBlue : V4.tilePeach;
  return (
    <View style={[styles.row, { minHeight: 40 * s }]}>
      <Pressable
        onPress={onToggle}
        accessibilityLabel={`סימון ${title}`}
        style={[
          styles.box,
          { width: 22 * s, height: 22 * s, borderRadius: 6 * s, marginEnd: 10 * s },
        ]}
      />
      <Text
        style={{
          fontFamily: heebo("500"),
          fontSize: 13 * s,
          color: V4.time,
          width: 52 * s,
          textAlign: "left",
        }}
      >
        {time}
      </Text>
      <Text
        style={{
          flex: 1,
          fontFamily: heebo("600"),
          fontSize: 15 * s,
          lineHeight: 20 * s,
          color: V4.text,
          textAlign: "right",
          paddingHorizontal: 10 * s,
        }}
        numberOfLines={1}
      >
        {title}
      </Text>
      <View style={[styles.chip, { width: 32 * s, height: 32 * s, borderRadius: 16 * s, backgroundColor: chip }]}>
        <HomeV4Icon name={icon} size={16 * s} color={V4.sageDeep} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  chip: { alignItems: "center", justifyContent: "center" },
  box: { borderWidth: 1.5, borderColor: V4.checkbox, backgroundColor: "transparent" },
});
