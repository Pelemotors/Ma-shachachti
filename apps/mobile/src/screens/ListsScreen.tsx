import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  addChecklistItem,
  createChecklist,
  listChecklists,
  toggleChecklistItem,
  type MobileChecklist,
} from "../api/checklists";
import {
  addShopping,
  listShopping,
  toggleShopping,
  type MobileShoppingItem,
} from "../api/shopping";
import { ErrorText, Field, PrimaryButton, ScreenShell } from "../ui/chrome";

export function ListsScreen({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<"shopping" | "checklists">("shopping");
  const [shopping, setShopping] = useState<MobileShoppingItem[]>([]);
  const [lists, setLists] = useState<MobileChecklist[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [shop, checks] = await Promise.all([listShopping(), listChecklists()]);
    setShopping(shop.shopping);
    setLists(checks.checklists);
  }, []);

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : "שגיאה"));
  }, [reload]);

  async function add() {
    const title = draft.trim();
    if (!title) return;
    setBusy(true);
    setError("");
    try {
      if (tab === "shopping") {
        setShopping((await addShopping(title)).shopping);
      } else {
        setLists((await createChecklist(title)).checklists);
      }
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell title="קניות וצ׳קליסטים" onBack={onBack}>
      <View style={styles.tabs}>
        <Pressable onPress={() => setTab("shopping")}>
          <Text style={tab === "shopping" ? styles.active : styles.tab}>קניות</Text>
        </Pressable>
        <Pressable onPress={() => setTab("checklists")}>
          <Text style={tab === "checklists" ? styles.active : styles.tab}>צ׳קליסטים</Text>
        </Pressable>
      </View>
      <Field
        value={draft}
        onChangeText={setDraft}
        placeholder={tab === "shopping" ? "פריט לקניות" : "שם רשימה"}
      />
      <PrimaryButton label={busy ? "שומר…" : "הוספה"} onPress={() => void add()} disabled={busy} />
      <ErrorText message={error} />
      {tab === "shopping"
        ? shopping.map((item) => (
            <Pressable
              key={item.id}
              style={styles.row}
              onPress={() =>
                void toggleShopping(item.id, !item.purchased_at).then((data) =>
                  setShopping(data.shopping),
                )
              }
            >
              <Text style={[styles.rowText, item.purchased_at ? styles.done : null]}>
                {item.title}
              </Text>
            </Pressable>
          ))
        : lists.map((list) => (
            <View key={list.id} style={styles.card}>
              <Text style={styles.listTitle}>{list.title}</Text>
              {list.items.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    void toggleChecklistItem(list.id, item.id, !item.checked).then((data) =>
                      setLists(data.checklists),
                    )
                  }
                >
                  <Text style={[styles.rowText, item.checked ? styles.done : null]}>
                    {item.checked ? "☑ " : "☐ "}
                    {item.text}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => {
                  const text = draft.trim();
                  if (!text) return;
                  void addChecklistItem(list.id, text).then((data) => {
                    setLists(data.checklists);
                    setDraft("");
                  });
                }}
              >
                <Text style={styles.addItem}>הוסף את הטקסט למעלה לפריט ברשימה</Text>
              </Pressable>
            </View>
          ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row-reverse", gap: 16 },
  tab: { color: "#8A7464", fontWeight: "600" },
  active: { color: "#3D2B1F", fontWeight: "800" },
  row: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  rowText: { textAlign: "right", color: "#3D2B1F", fontWeight: "600" },
  done: { color: "#8A7464", textDecorationLine: "line-through" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 12, gap: 8 },
  listTitle: { textAlign: "right", fontWeight: "800", color: "#3D2B1F" },
  addItem: { textAlign: "right", color: "#8B5E3C" },
});
