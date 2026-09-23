import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen, ChecklistRow, EmptyState, ScreenHeader } from "../components/ui";
import { addShopping, listShopping, toggleShopping, type MobileShoppingItem } from "../api/shopping";
import { ChatComposer } from "../components/ui/ChatComposer";
import { shoppingAddResult } from "../product/surfaceCommit";
import { rtlText, space } from "../theme";

export function ShoppingScreen() {
  const [items, setItems] = useState<MobileShoppingItem[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setItems((await listShopping()).shopping);
  }, []);

  useEffect(() => {
    void reload().catch(() => setItems([]));
  }, [reload]);

  async function add() {
    const title = draft.trim();
    if (!title || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await addShopping(title);
      const result = shoppingAddResult(true, title);
      if (result.acceptList) setItems(data.shopping);
      setDraft(result.nextDraft);
    } catch (err) {
      const result = shoppingAddResult(false, draft);
      setDraft(result.nextDraft);
      if (result.showError) {
        setError(err instanceof Error ? err.message : "לא הצלחנו להוסיף את הפריט");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen
      footer={
        <View style={styles.footer}>
          {error ? (
            <Pressable onPress={() => void add()} accessibilityLabel="נסי שוב">
              <Text style={styles.error}>{error} · נסי שוב</Text>
            </Pressable>
          ) : null}
          <ChatComposer
            value={draft}
            onChangeText={setDraft}
            onSend={() => void add()}
            placeholder="פריט לקניות"
          />
        </View>
      }
    >
      <ScreenHeader title="קניות" icon="cart-outline" />
      {items.length === 0 ? (
        <EmptyState title="הרשימה ריקה" body="אפשר להוסיף פריט למטה." />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <ChecklistRow
              key={item.id}
              label={item.title}
              checked={Boolean(item.purchased_at)}
              onToggle={() =>
                void toggleShopping(item.id, !item.purchased_at).then((data) =>
                  setShoppingSafe(data.shopping, setItems),
                )
              }
            />
          ))}
        </View>
      )}
    </AppScreen>
  );
}

function setShoppingSafe(
  shopping: MobileShoppingItem[],
  setItems: (items: MobileShoppingItem[]) => void,
) {
  setItems(shopping);
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  footer: { paddingHorizontal: 24, paddingBottom: 8, gap: 8 },
  error: { ...rtlText, color: "#8B2E1F", fontSize: 13 },
});
