import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export function BootstrapScreen() {
  return (
    <View style={styles.wrap} accessibilityLabel="טוען">
      <ActivityIndicator size="large" color="#8B5E3C" />
      <Text style={styles.text}>טוען…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F1EA",
    gap: 12,
  },
  text: { color: "#5C4033", fontSize: 16 },
});
