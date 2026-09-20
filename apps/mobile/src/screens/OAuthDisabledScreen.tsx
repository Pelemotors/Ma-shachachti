import { StyleSheet, Text, View } from "react-native";
import { nativeOAuthHint } from "../auth/nativeIdentity";

export function OAuthDisabledScreen({ kind }: { kind: "google" | "apple" | "calendar" }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>
        {kind === "calendar" ? "חיבור יומן" : kind === "google" ? "Google" : "Apple"}
      </Text>
      <Text style={styles.body}>{nativeOAuthHint(kind)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, backgroundColor: "#F7F1EA", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  body: { textAlign: "right", color: "#8A7464", lineHeight: 22 },
});
