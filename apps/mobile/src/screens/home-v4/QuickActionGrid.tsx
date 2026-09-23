import { Pressable, StyleSheet, Text, View } from "react-native";
import { HomeV4Icon, type HomeV4IconName } from "./homeV4Icons";
import { heebo, V4 } from "./homeV4Theme";

const TILES: Array<{
  id: string;
  title: string;
  body: string;
  icon: HomeV4IconName;
  chip: string;
}> = [
  { id: "freetime", title: "יש לי זמן פנוי", body: "מצא רעיונות למה עכשיו", icon: "clock", chip: V4.tileBlue },
  { id: "plan", title: "צור לי לו״ז", body: "מה חשוב ומתי", icon: "calendar", chip: V4.tilePeach },
  { id: "shopping", title: "קניות", body: "רשימות וקניות חכמות", icon: "cart", chip: V4.tileGreen },
  { id: "checklists", title: "צ׳קליסטים", body: "לכל תחומי החיים", icon: "checklist", chip: V4.tileLilac },
];

export function QuickActionTile({
  scale,
  title,
  body,
  icon,
  chip,
  onPress,
}: {
  scale: number;
  title: string;
  body: string;
  icon: HomeV4IconName;
  chip: string;
  onPress: () => void;
}) {
  const s = scale;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={title}
      style={[
        styles.tile,
        {
          flex: 1,
          minHeight: 84 * s,
          borderRadius: 22 * s,
          padding: 12 * s,
        },
      ]}
    >
      <View style={{ flex: 1, marginEnd: 8 * s }}>
        <Text style={{ fontFamily: heebo("700"), fontSize: 14 * s, lineHeight: 18 * s, color: V4.text, textAlign: "right" }}>
          {title}
        </Text>
        <Text style={{ fontFamily: heebo("400"), fontSize: 11 * s, lineHeight: 14 * s, color: V4.muted, textAlign: "right", marginTop: 2 * s }}>
          {body}
        </Text>
      </View>
      <View style={[styles.chip, { width: 32 * s, height: 32 * s, borderRadius: 16 * s, backgroundColor: chip }]}>
        <HomeV4Icon name={icon} size={16 * s} color={V4.sageDeep} />
      </View>
    </Pressable>
  );
}

export function QuickActionGrid({
  scale,
  onOpen,
}: {
  scale: number;
  onOpen: (id: string) => void;
}) {
  const s = scale;
  return (
    <View style={{ marginHorizontal: 16 * s, gap: 10 * s }}>
      <View style={{ flexDirection: "row", gap: 10 * s }}>
        <QuickActionTile {...TILES[0]} scale={s} onPress={() => onOpen(TILES[0].id)} />
        <QuickActionTile {...TILES[1]} scale={s} onPress={() => onOpen(TILES[1].id)} />
      </View>
      <View style={{ flexDirection: "row", gap: 10 * s }}>
        <QuickActionTile {...TILES[2]} scale={s} onPress={() => onOpen(TILES[2].id)} />
        <QuickActionTile {...TILES[3]} scale={s} onPress={() => onOpen(TILES[3].id)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: V4.card,
    flexDirection: "row",
    alignItems: "center",
  },
  chip: { alignItems: "center", justifyContent: "center" },
});
