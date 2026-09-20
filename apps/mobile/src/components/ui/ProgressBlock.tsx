import { StyleSheet, Text, View } from "react-native";
import { colors, radius, rtlText } from "../../theme";

export function ProgressBlock({
  title,
  done,
  total,
  caption,
}: {
  title: string;
  done: number;
  total: number;
  caption?: string;
}) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.count}>
        {done} מתוך {total}
        {caption ? ` ${caption}` : ""}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingTop: 2 },
  title: { ...rtlText, color: colors.text, fontWeight: "600", fontSize: 15 },
  count: { ...rtlText, color: colors.textMuted, fontSize: 12 },
  track: {
    height: 4,
    borderRadius: radius.progress,
    backgroundColor: colors.line,
    overflow: "hidden",
    marginTop: 2,
  },
  fill: { height: "100%", backgroundColor: colors.accentSoft, borderRadius: radius.progress },
});
