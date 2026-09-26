import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  AppScreen,
  BotanicalBackdrop,
  EmptyState,
  PackActionIcon,
  PackStateIcon,
  ProgressBlock,
  ScreenHeader,
} from "../components/ui";
import {
  addChecklistItem,
  archiveChecklist,
  deleteChecklist,
  duplicateChecklist,
  listChecklists,
  removeChecklistItem,
  renameChecklist,
  reorderChecklistItems,
  resetChecklist,
  toggleChecklistItem,
  updateChecklistItem,
  type MobileChecklist,
} from "../api/checklists";
import { jerusalemDateFromNow } from "../api/planning";
import { CL } from "../product/checklistTokens";
import { heebo } from "./home-v4/homeV4Theme";

export function ChecklistDetailScreen({
  listId,
  occurrenceKey,
  onBack,
}: {
  listId: string;
  occurrenceKey?: string;
  onBack: () => void;
}) {
  const [list, setList] = useState<MobileChecklist | null>(null);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [error, setError] = useState("");
  const today = jerusalemDateFromNow();
  const tomorrow = jerusalemDateFromNow(1);
  const seriesPrefix = occurrenceKey?.replace(/:\d{4}-\d{2}-\d{2}$/, "") ?? null;
  const [activeKey, setActiveKey] = useState(occurrenceKey);
  function keyFor(date: string) {
    return seriesPrefix ? `${seriesPrefix}:${date}` : `manual:${listId}:${date}`;
  }

  const reload = useCallback(async () => {
    const data = await listChecklists(activeKey);
    const next = data.checklists.find((item) => item.id === listId) ?? null;
    setList(next);
    setTitle(next?.title ?? "");
  }, [activeKey, listId]);

  useEffect(() => {
    void reload().catch(() => setList(null));
  }, [reload]);

  const done = list?.items.filter((item) => item.checked).length ?? 0;
  const total = list?.items.length ?? 0;

  async function apply(next: Promise<{ checklists: MobileChecklist[] }>, after?: () => void) {
    try {
      const data = await next;
      setList(data.checklists.find((item) => item.id === listId) ?? null);
      setError("");
      after?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "הפעולה נכשלה.");
    }
  }

  function addItem() {
    const text = draft.trim();
    if (!list || !text) return;
    setDraft("");
    void apply(addChecklistItem(list.id, text));
  }

  return (
    <AppScreen
      padded={false}
      decor={false}
      footer={
        <View style={styles.footer}>
          <View style={styles.addRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="פריט חדש"
              placeholderTextColor={CL.secondary}
              style={styles.addInput}
              textAlign="right"
              returnKeyType="done"
              onSubmitEditing={addItem}
            />
            <Pressable style={styles.add} onPress={addItem} accessibilityLabel="הוספה">
              <Text style={styles.addText}>הוספה</Text>
            </Pressable>
          </View>
          <View style={styles.actions}>
            <Pressable onPress={() => list && void apply(resetChecklist(list.id, activeKey))} style={styles.action}>
              <PackActionIcon name="reset" size={18} />
              <Text style={styles.link}>איפוס ביצוע</Text>
            </Pressable>
            <Pressable onPress={() => list && void apply(duplicateChecklist(list.id), onBack)} style={styles.action}>
              <PackActionIcon name="duplicate" size={18} />
              <Text style={styles.link}>שכפול</Text>
            </Pressable>
            <Pressable onPress={() => list && void apply(archiveChecklist(list.id), onBack)} style={styles.action}>
              <PackActionIcon name="archive" size={18} />
              <Text style={styles.link}>ארכיון</Text>
            </Pressable>
            <Pressable onPress={() => list && void apply(deleteChecklist(list.id), onBack)} style={styles.action}>
              <PackActionIcon name="trash" size={18} />
              <Text style={styles.danger}>מחיקה</Text>
            </Pressable>
          </View>
        </View>
      }
    >
      <BotanicalBackdrop />
      <View style={styles.page}>
        <ScreenHeader title={list?.title ?? "צ׳קליסט"} onBack={onBack} />
        <Text style={styles.hint}>הסימון נשמר בביצוע הנוכחי. התבנית עצמה לא משתנה.</Text>
        <View style={styles.keys}>
          <Pressable onPress={() => setActiveKey(undefined)} style={[styles.key, !activeKey && styles.keyOn]}>
            <Text style={[styles.keyText, !activeKey && styles.keyTextOn]}>ביצוע כללי</Text>
          </Pressable>
          <Pressable onPress={() => setActiveKey(keyFor(today))} style={[styles.key, activeKey === keyFor(today) && styles.keyOn]}>
            <Text style={[styles.keyText, activeKey === keyFor(today) && styles.keyTextOn]}>היום</Text>
          </Pressable>
          <Pressable onPress={() => setActiveKey(keyFor(tomorrow))} style={[styles.key, activeKey === keyFor(tomorrow) && styles.keyOn]}>
            <Text style={[styles.keyText, activeKey === keyFor(tomorrow) && styles.keyTextOn]}>מחר</Text>
          </Pressable>
        </View>
        <ProgressBlock title={`${done} מתוך ${total}`} done={done} total={total} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TextInput
          value={title}
          onChangeText={setTitle}
          onEndEditing={() => {
            const next = title.trim();
            if (list && next && next !== list.title) void apply(renameChecklist(list.id, next));
          }}
          style={styles.rename}
          textAlign="right"
        />
        {!list || list.items.length === 0 ? <EmptyState title="אין פריטים ברשימה" /> : (
          <View style={styles.list}>
            {list.items.map((item, index) => (
              <View key={item.id} style={styles.row}>
                <Pressable
                  onPress={() => void apply(toggleChecklistItem(list.id, item.id, !item.checked, activeKey))}
                  style={styles.checkRow}
                >
                  <PackStateIcon checked={item.checked} size={24} />
                  {editingId === item.id ? null : <Text style={[styles.itemText, item.checked && styles.itemDone]}>{item.text}</Text>}
                </Pressable>
                {editingId === item.id ? (
                  <TextInput
                    value={editingText}
                    onChangeText={setEditingText}
                    onEndEditing={() => {
                      const next = editingText.trim();
                      setEditingId(null);
                      if (next) void apply(updateChecklistItem(list.id, item.id, next));
                    }}
                    style={styles.edit}
                    textAlign="right"
                  />
                ) : (
                  <View style={styles.itemActions}>
                    <Pressable onPress={() => { setEditingId(item.id); setEditingText(item.text); }}>
                      <Text style={styles.link}>עריכה</Text>
                    </Pressable>
                    <Pressable disabled={index === 0} onPress={() => {
                      const ids = list.items.map((row) => row.id);
                      const swap = [...ids];
                      [swap[index - 1], swap[index]] = [swap[index], swap[index - 1]];
                      void apply(reorderChecklistItems(list.id, swap));
                    }}><Text style={styles.link}>למעלה</Text></Pressable>
                    <Pressable disabled={index === list.items.length - 1} onPress={() => {
                      const ids = list.items.map((row) => row.id);
                      const swap = [...ids];
                      [swap[index + 1], swap[index]] = [swap[index], swap[index + 1]];
                      void apply(reorderChecklistItems(list.id, swap));
                    }}><Text style={styles.link}>למטה</Text></Pressable>
                    <Pressable onPress={() => void apply(removeChecklistItem(list.id, item.id))}><Text style={styles.danger}>מחיקה</Text></Pressable>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 20 },
  hint: { fontFamily: heebo("400"), fontSize: 12, color: CL.secondary, textAlign: "right", marginBottom: 10 },
  keys: { flexDirection: "row-reverse", gap: 8, marginBottom: 12 },
  key: { borderRadius: 16, borderWidth: 1, borderColor: CL.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: CL.surface },
  keyOn: { backgroundColor: CL.terracotta, borderColor: CL.terracotta },
  keyText: { fontFamily: heebo("500"), fontSize: 12, color: CL.text },
  keyTextOn: { color: "#FFFDF9" },
  error: { fontFamily: heebo("400"), color: CL.danger, textAlign: "right", marginTop: 8 },
  rename: { fontFamily: heebo("700"), fontSize: 20, color: CL.text, textAlign: "right", marginTop: 16, borderBottomWidth: 1, borderBottomColor: CL.border, paddingBottom: 6 },
  list: { gap: 10, marginTop: 16 },
  row: { backgroundColor: "rgba(255,253,249,0.92)", borderRadius: 22, padding: 12, borderWidth: 1, borderColor: CL.border },
  checkRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, minHeight: 44 },
  itemText: { flex: 1, fontFamily: heebo("500"), fontSize: 15, color: CL.text, textAlign: "right" },
  itemDone: { color: CL.secondary },
  itemActions: { flexDirection: "row-reverse", gap: 12, marginTop: 8 },
  link: { fontFamily: heebo("500"), fontSize: 12, color: CL.terracotta },
  danger: { fontFamily: heebo("500"), fontSize: 12, color: CL.danger },
  edit: { borderWidth: 1, borderColor: CL.border, borderRadius: 12, paddingHorizontal: 10, minHeight: 40, color: CL.text, fontFamily: heebo("400") },
  footer: { paddingHorizontal: 20, paddingBottom: 10, gap: 10, backgroundColor: CL.bg },
  addRow: { flexDirection: "row-reverse", gap: 8 },
  addInput: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: CL.border, borderRadius: 14, paddingHorizontal: 12, backgroundColor: CL.surface, color: CL.text, fontFamily: heebo("400") },
  add: { backgroundColor: CL.terracotta, borderRadius: 14, paddingHorizontal: 14, justifyContent: "center" },
  addText: { color: "#FFFDF9", fontFamily: heebo("700") },
  actions: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12 },
  action: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
});
