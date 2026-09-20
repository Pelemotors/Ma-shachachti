import { StyleSheet, Text, View } from "react-native";
import { colors, rtlText, space, type } from "../../theme";

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: space.md, gap: space.xs },
  title: { ...type.section, ...rtlText },
  body: { ...type.body, ...rtlText, color: colors.textMuted },
});
