import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen, EmptyState, PackCategoryIcon, ScreenHeader } from "../components/ui";
import { addShopping, listShopping, removeShopping, toggleShopping, updateShopping, type MobileShoppingItem } from "../api/shopping";
import { rtlText, space } from "../theme";

export function ShoppingScreen() {
  const [items, setItems] = useState<MobileShoppingItem[]>([]);
  const [draft, setDraft] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => setItems((await listShopping()).shopping), []);
  useEffect(() => { void reload().catch(() => setItems([])); }, [reload]);

  const active = useMemo(() => items.filter((item) => !item.purchased_at), [items]);
  const purchased = useMemo(() => items.filter((item) => Boolean(item.purchased_at)), [items]);

  async function add() {
    const title = draft.trim(); if (!title || busy) return;
    setBusy(true); setError("");
    try { const data = await addShopping(title, draftNotes.trim()); setItems(data.shopping); setDraft(""); setDraftNotes(""); setNotesOpen(false); }
    catch (err) { setError(err instanceof Error ? err.message : "לא הצלחנו להוסיף את הפריט"); }
    finally { setBusy(false); }
  }

  function startEdit(item: MobileShoppingItem) { setEditingId(item.id); setEditTitle(item.title); setEditNotes(item.notes ?? ""); setError(""); }
  async function saveEdit() {
    if (!editingId || !editTitle.trim() || busy) return;
    setBusy(true); setError("");
    try { const data = await updateShopping(editingId, { title: editTitle.trim(), notes: editNotes.trim() }); setItems(data.shopping); setEditingId(null); }
    catch (err) { setError(err instanceof Error ? err.message : "לא הצלחנו לשמור את השינוי"); }
    finally { setBusy(false); }
  }
  async function toggle(item: MobileShoppingItem) {
    if (busy) return; setBusy(true); setError("");
    try { setItems((await toggleShopping(item.id, !item.purchased_at)).shopping); }
    catch (err) { setError(err instanceof Error ? err.message : "לא הצלחנו לעדכן את הפריט"); }
    finally { setBusy(false); }
  }
  async function remove(item: MobileShoppingItem) {
    if (busy) return; setBusy(true); setError("");
    try { setItems((await removeShopping(item.id)).shopping); }
    catch (err) { setError(err instanceof Error ? err.message : "לא הצלחנו למחוק את הפריט"); }
    finally { setBusy(false); }
  }
  function toggleNotes(id: string) { setExpandedNotes((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }

  return <AppScreen>
    <ScreenHeader title="קניות" icon="cart-outline" />
    <View style={styles.addBox}>
      <View style={styles.addRow}>
        <TextInput value={draft} onChangeText={setDraft} placeholder="מה להוסיף?" placeholderTextColor="#918881" style={styles.input} textAlign="right" />
        <Pressable accessibilityRole="button" accessibilityLabel="הוסף" onPress={() => void add()} disabled={busy || !draft.trim()} style={styles.addButton}><Text style={styles.addButtonText}>הוסף</Text></Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="הערות" onPress={() => setNotesOpen((value) => !value)}><Text style={styles.notesToggle}>{notesOpen ? "הסתר הערות" : "הוסף הערה"}</Text></Pressable>
      {notesOpen ? <TextInput value={draftNotes} onChangeText={setDraftNotes} placeholder="הערה לפריט" placeholderTextColor="#918881" style={[styles.input, styles.noteInput]} textAlign="right" multiline /> : null}
    </View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {active.length === 0 && purchased.length === 0 ? <EmptyState title="הרשימה ריקה" body="אפשר להוסיף פריט חדש למעלה." /> : null}
    {active.length ? <Section title="פעילים" items={active} expandedNotes={expandedNotes} editingId={editingId} editTitle={editTitle} editNotes={editNotes} setEditTitle={setEditTitle} setEditNotes={setEditNotes} onToggleNotes={toggleNotes} onToggle={toggle} onEdit={startEdit} onSave={saveEdit} onCancel={() => setEditingId(null)} onRemove={remove} busy={busy} /> : null}
    {purchased.length ? <Section title="נקנו" items={purchased} expandedNotes={expandedNotes} editingId={editingId} editTitle={editTitle} editNotes={editNotes} setEditTitle={setEditTitle} setEditNotes={setEditNotes} onToggleNotes={toggleNotes} onToggle={toggle} onEdit={startEdit} onSave={saveEdit} onCancel={() => setEditingId(null)} onRemove={remove} busy={busy} /> : null}
  </AppScreen>;
}

function Section(props: { title: string; items: MobileShoppingItem[]; expandedNotes: Set<string>; editingId: string | null; editTitle: string; editNotes: string; setEditTitle: (value: string) => void; setEditNotes: (value: string) => void; onToggleNotes: (id: string) => void; onToggle: (item: MobileShoppingItem) => void; onEdit: (item: MobileShoppingItem) => void; onSave: () => void; onCancel: () => void; onRemove: (item: MobileShoppingItem) => void; busy: boolean; }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{props.title}</Text>{props.items.map((item) => <View key={item.id} style={styles.itemCard}>
    <View style={styles.itemRow}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`סימון ${item.title}`} onPress={() => props.onToggle(item)} disabled={props.busy} style={[styles.check, item.purchased_at ? styles.checkOn : null]}><Text style={styles.checkText}>{item.purchased_at ? "✓" : ""}</Text></Pressable>
      <PackCategoryIcon name={item.category as never} size={25} />
      {props.editingId === item.id ? <TextInput value={props.editTitle} onChangeText={props.setEditTitle} style={[styles.input, styles.editInput]} textAlign="right" autoFocus /> : <Pressable onPress={() => props.onEdit(item)} style={styles.titlePress}><Text style={[styles.title, item.purchased_at ? styles.struck : null]}>{item.title}</Text></Pressable>}
      <Pressable accessibilityLabel={`מחיקת ${item.title}`} onPress={() => props.onRemove(item)} disabled={props.busy}><Text style={styles.delete}>מחק</Text></Pressable>
    </View>
    {props.editingId === item.id ? <View style={styles.editActions}><TextInput value={props.editNotes} onChangeText={props.setEditNotes} placeholder="הערה" style={[styles.input, styles.noteInput]} textAlign="right" multiline /><Pressable onPress={props.onSave}><Text style={styles.action}>שמור</Text></Pressable><Pressable onPress={props.onCancel}><Text style={styles.action}>ביטול</Text></Pressable></View> : item.notes ? <Pressable onPress={() => props.onToggleNotes(item.id)}><Text style={styles.notesToggle}>{props.expandedNotes.has(item.id) ? item.notes : "הצג הערה"}</Text></Pressable> : null}
    {item.purchased_at ? <Pressable accessibilityLabel={`החזרת ${item.title}`} onPress={() => props.onToggle(item)} disabled={props.busy}><Text style={styles.action}>החזר לפעילים</Text></Pressable> : null}
  </View>)}</View>;
}

const styles = StyleSheet.create({
  addBox: { gap: 8, marginBottom: space.md }, addRow: { flexDirection: "row-reverse", gap: 8, alignItems: "center" }, input: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: "#DDD3CA", borderRadius: 12, paddingHorizontal: 12, color: "#342B28", ...rtlText }, addButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: "#5E6C52", alignItems: "center", justifyContent: "center" }, addButtonText: { color: "#FFF", fontWeight: "700" }, notesToggle: { color: "#6A5E52", textAlign: "right", paddingVertical: 4 }, noteInput: { minHeight: 56, marginTop: 4 }, error: { color: "#8B2E1F", textAlign: "right", marginBottom: 8 }, section: { gap: 8, marginBottom: space.lg }, sectionTitle: { ...rtlText, textAlign: "right", fontSize: 17, fontWeight: "700", color: "#342B28" }, itemCard: { gap: 6, padding: 12, borderRadius: 14, backgroundColor: "#FFFDF9" }, itemRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 }, check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: "#B9AEA5", alignItems: "center", justifyContent: "center" }, checkOn: { backgroundColor: "#5E6C52", borderColor: "#5E6C52" }, checkText: { color: "#FFF" }, titlePress: { flex: 1 }, title: { ...rtlText, textAlign: "right", color: "#342B28", fontSize: 15, fontWeight: "600" }, struck: { textDecorationLine: "line-through", color: "#918881" }, editInput: { flex: 1, minHeight: 38 }, editActions: { gap: 6 }, action: { color: "#5E6C52", textAlign: "right", paddingVertical: 4, fontWeight: "600" }, delete: { color: "#A23B4A", fontSize: 12 },
});
