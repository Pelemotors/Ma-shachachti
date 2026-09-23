import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { MobileNotification } from "../../api/notifications";
import { heebo, V4 } from "./homeV4Theme";

export function HomeNotificationsSheet({
  items,
  onClose,
  onOpen,
}: {
  items: MobileNotification[];
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Pressable onPress={onClose} accessibilityLabel="סגור">
          <Text style={styles.back}>חזרה</Text>
        </Pressable>
        <Text style={styles.title}>התראות</Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {items.length === 0 ? (
          <Text style={styles.empty}>אין התראות חדשות.</Text>
        ) : (
          items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onOpen(item.id)}
              style={[styles.row, !item.opened_at ? styles.unread : null]}
            >
              <Text style={styles.rowTitle}>{item.title || "התראה"}</Text>
              {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: V4.page, paddingTop: 24 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  back: { fontFamily: heebo("500"), color: V4.sageDeep, fontSize: 16 },
  title: { fontFamily: heebo("700"), fontSize: 20, color: V4.text },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 10 },
  empty: { fontFamily: heebo("400"), color: V4.muted, textAlign: "right", marginTop: 24 },
  row: {
    backgroundColor: V4.card,
    borderRadius: 16,
    padding: 14,
  },
  unread: { borderWidth: 1, borderColor: V4.sageSoft },
  rowTitle: { fontFamily: heebo("600"), fontSize: 15, color: V4.text, textAlign: "right" },
  body: { fontFamily: heebo("400"), fontSize: 13, color: V4.muted, textAlign: "right", marginTop: 4 },
});
