import { StyleSheet, Text, View } from "react-native";
import { rtlText, space, type } from "../../theme";

export function TopGreetingHeader({
  tagline = "הבית שלך, בקצב שלך",
  greeting,
}: {
  tagline?: string;
  greeting: string;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.tag}>{tagline}</Text>
      <Text style={styles.hi}>{greeting}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 2, paddingBottom: space.xs, gap: 2 },
  tag: { ...type.caption, ...rtlText, fontSize: 11, lineHeight: 15 },
  hi: { ...type.greeting, ...rtlText },
});
