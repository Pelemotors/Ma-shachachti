import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  AppScreen,
  BotanicalBackdrop,
  EmptyState,
  PackActionIcon,
  PackCategoryIcon,
  PackStateIcon,
  ScreenHeader,
  categoryForTitle,
} from "../components/ui";
import { createChecklist, listChecklists, type MobileChecklist } from "../api/checklists";
import { CL } from "../product/checklistTokens";
import { heebo } from "./home-v4/homeV4Theme";

export function ChecklistsScreen({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const [lists, setLists] = useState<MobileChecklist[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLists((await listChecklists()).checklists);
  }, []);

  useEffect(() => {
    void reload().catch(() => setLists([]));
  }, [reload]);

  const visible = useMemo(
    () => lists.filter((list) => !query.trim() || list.title.includes(query.trim())),
    [lists, query],
  );
  const active = visible.filter((list) => list.items.some((item) => item.checked));
  const saved = visible.filter((list) => !list.items.some((item) => item.checked));

  async function save() {
    const name = title.trim();
    const rows = items.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!name) {
      setError("חסר שם לצ׳קליסט.");
      return;
    }
    setError("");
    try {
      await createChecklist(name, rows);
      setTitle("");
      setItems("");
      setOpen(false);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "השמירה נכשלה.");
    }
  }

  function card(list: MobileChecklist, showProgress: boolean) {
    const done = list.items.filter((item) => item.checked).length;
    return (
      <Pressable key={list.id} onPress={() => onOpen(list.id)} style={styles.card}>
        <View style={styles.iconWrap}>
          <PackCategoryIcon name={categoryForTitle(list.title)} size={28} />
        </View>
        <View style={styles.body}>
          <Text style={styles.cardTitle}>{list.title}</Text>
          {showProgress ? (
            <>
              <Text style={styles.meta}>{done} מתוך {list.items.length}</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${list.items.length ? (done / list.items.length) * 100 : 0}%` }]} />
              </View>
            </>
          ) : (
            <Text style={styles.meta}>{list.items.length} פריטים בתבנית</Text>
          )}
          {list.items.slice(0, 2).map((item) => (
            <View key={item.id} style={styles.previewRow}>
              <PackStateIcon checked={item.checked} size={16} />
              <Text style={styles.preview}>{item.text}</Text>
            </View>
          ))}
        </View>
        <PackActionIcon name="chevron-right" size={18} />
      </Pressable>
    );
  }

  return (
    <AppScreen scroll={false} padded={false} decor={false}>
      <BotanicalBackdrop />
      <View style={styles.page}>
        <ScreenHeader title="צ׳קליסטים" onBack={onBack} />
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="צ׳קליסט חדש" onPress={() => setOpen(true)} style={styles.add}>
            <Text style={styles.addPlus}>＋</Text>
          </Pressable>
          <Text style={styles.sub}>תבניות לבדיקה. הסימונים נשמרים בביצוע, לא בתבנית.</Text>
        </View>
        <View style={styles.search}>
          <PackActionIcon name="search" size={18} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="חיפוש צ׳קליסט"
            placeholderTextColor={CL.secondary}
            style={styles.searchInput}
            textAlign="right"
          />
        </View>
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {lists.length === 0 ? (
            <EmptyState title="אין עדיין צ׳קליסטים" body="צרי רשימה חדשה. אפשר להוסיף פריטים עכשיו או אחר כך." />
          ) : (
            <>
              {active.length ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>היום והקרובים</Text>
                  {active.map((list) => card(list, true))}
                </View>
              ) : null}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>תבניות</Text>
                {saved.length ? saved.map((list) => card(list, false)) : <Text style={styles.emptyHint}>אין תבניות נוספות.</Text>}
              </View>
            </>
          )}
        </ScrollView>
      </View>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>צ׳קליסט חדש</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="שם הצ׳קליסט" placeholderTextColor={CL.secondary} style={styles.input} textAlign="right" />
            <TextInput value={items} onChangeText={setItems} placeholder="פריט אחד בכל שורה" placeholderTextColor={CL.secondary} style={[styles.input, styles.multiline]} multiline textAlign="right" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <Pressable onPress={() => setOpen(false)}><Text style={styles.cancel}>ביטול</Text></Pressable>
              <Pressable onPress={() => void save()} style={styles.save}><Text style={styles.saveText}>צור צ׳קליסט</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 20 },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 16 },
  sub: { fontFamily: heebo("400"), fontSize: 14, color: CL.secondary, textAlign: "right", flex: 1 },
  add: { width: 52, height: 52, borderRadius: 26, backgroundColor: CL.terracotta, alignItems: "center", justifyContent: "center" },
  addPlus: { color: "#FFFDF9", fontSize: 28, lineHeight: 30 },
  search: {
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: CL.surface,
    borderWidth: 1,
    borderColor: CL.border,
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  searchInput: { flex: 1, fontFamily: heebo("400"), fontSize: 15, color: CL.text },
  list: { gap: 16, paddingBottom: 120 },
  section: { gap: 10 },
  sectionTitle: { fontFamily: heebo("700"), fontSize: 16, color: CL.text, textAlign: "right" },
  card: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 14,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 22,
    backgroundColor: "rgba(255,253,249,0.92)",
    borderWidth: 1,
    borderColor: CL.border,
    shadowColor: "#543D2D",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  iconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: CL.peach, alignItems: "center", justifyContent: "center" },
  body: { flex: 1 },
  cardTitle: { fontFamily: heebo("700"), fontSize: 16, color: CL.text, textAlign: "right" },
  meta: { fontFamily: heebo("500"), fontSize: 12, color: CL.terracotta, textAlign: "right", marginTop: 4 },
  track: { height: 6, borderRadius: 3, backgroundColor: CL.progressTrack, overflow: "hidden", marginTop: 8 },
  fill: { height: "100%", backgroundColor: CL.green },
  previewRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 4 },
  preview: { fontFamily: heebo("400"), fontSize: 12, color: CL.secondary, textAlign: "right", flex: 1 },
  emptyHint: { fontFamily: heebo("400"), color: CL.secondary, textAlign: "right" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(58,47,40,0.28)" },
  modal: { backgroundColor: CL.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, gap: 12 },
  modalTitle: { fontFamily: heebo("700"), fontSize: 24, color: CL.text, textAlign: "right" },
  input: { minHeight: 52, borderRadius: 24, borderWidth: 1, borderColor: CL.border, paddingHorizontal: 16, color: CL.text, backgroundColor: CL.surface, fontFamily: heebo("400"), fontSize: 15 },
  multiline: { minHeight: 140, textAlignVertical: "top", paddingTop: 14 },
  actions: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  cancel: { fontFamily: heebo("500"), color: CL.secondary, fontSize: 15 },
  save: { backgroundColor: CL.terracotta, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 18 },
  saveText: { fontFamily: heebo("700"), color: "#FFFDF9", fontSize: 15 },
  error: { fontFamily: heebo("400"), color: CL.danger, textAlign: "right" },
});
