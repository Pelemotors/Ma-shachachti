import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppScreen, ChecklistRow, EmptyState, ScreenHeader } from "../components/ui";
import { addShopping, listShopping, toggleShopping, type MobileShoppingItem } from "../api/shopping";
import { ChatComposer } from "../components/ui/ChatComposer";
import { space } from "../theme";

export function ShoppingScreen() {
  const [items, setItems] = useState<MobileShoppingItem[]>([]);
  const [draft, setDraft] = useState("");

  const reload = useCallback(async () => {
    setItems((await listShopping()).shopping);
  }, []);

  useEffect(() => {
    void reload().catch(() => setItems([]));
  }, [reload]);

  async function add() {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    try {
      setItems((await addShopping(title)).shopping);
    } catch {
      /* stay */
    }
  }

  return (
    <AppScreen
      footer={
        <View style={styles.footer}>
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
  footer: { paddingHorizontal: 24, paddingBottom: 8 },
});
