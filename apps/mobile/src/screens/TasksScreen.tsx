import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  AppScreen,
  BotanicalBackdrop,
  DateTimeField,
  EmptyState,
  PackActionIcon,
  PackStateIcon,
} from "../components/ui";
import { listChecklists, type MobileChecklist } from "../api/checklists";
import { formatDisplayDate, jerusalemDateFromNow, sortByDeadline } from "../api/planning";
import {
  createRoutine,
  listRoutines,
  routineException,
  routineOccurrenceKey,
  stopRoutine,
  updateRoutine,
  type MobileRoutine,
} from "../api/routines";
import {
  completeTask,
  createTask,
  deleteTask,
  duplicateTask,
  listTasks,
  reopenTask,
  updateTask,
  type MobileTask,
} from "../api/tasks";
import { CL } from "../product/checklistTokens";
import { heebo } from "./home-v4/homeV4Theme";

type Filter = "all" | "undated" | "dated" | "routine";
type Scope = "once" | "from_today";

const WEEKDAYS = [
  { day: 0, label: "א׳" },
  { day: 1, label: "ב׳" },
  { day: 2, label: "ג׳" },
  { day: 3, label: "ד׳" },
  { day: 4, label: "ה׳" },
  { day: 5, label: "ו׳" },
  { day: 6, label: "ש׳" },
];
const ESTIMATES = [15, 30, 45, 60, 90];

function weekdayLabel(days: number[]) {
  return WEEKDAYS.filter((item) => days.includes(item.day)).map((item) => item.label).join(" ");
}

function clockLabel(value: string | null) {
  return value ? value.slice(0, 5) : "בלי שעה";
}

function nextOccurrenceDate(weekdays: number[], fromDate: string) {
  const [year, month, day] = fromDate.split("-").map(Number);
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekdays.includes(weekday)) return date;
  }
  return fromDate;
}

export function TasksScreen({
  onBack,
  onOpenChecklist,
}: {
  onBack?: () => void;
  onOpenChecklist?: (id: string, occurrenceKey?: string) => void;
}) {
  const [tasks, setTasks] = useState<MobileTask[]>([]);
  const [routines, setRoutines] = useState<MobileRoutine[]>([]);
  const [checklists, setChecklists] = useState<MobileChecklist[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [menuTask, setMenuTask] = useState<MobileTask | null>(null);
  const [editing, setEditing] = useState<MobileTask | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const [recurring, setRecurring] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [timeOfDay, setTimeOfDay] = useState("");
  const [scope, setScope] = useState<Scope>("from_today");
  const [occurrenceOn, setOccurrenceOn] = useState(jerusalemDateFromNow());
  const [error, setError] = useState("");
  const today = jerusalemDateFromNow();

  const reload = useCallback(async () => {
    const [nextTasks, nextRoutines, nextLists] = await Promise.all([
      listTasks(),
      listRoutines().catch(() => ({ routines: [] as MobileRoutine[] })),
      listChecklists(),
    ]);
    setTasks(nextTasks.tasks.filter((task) => task.status !== "cancelled"));
    setRoutines(nextRoutines.routines.filter((routine) => routine.active));
    setChecklists(nextLists.checklists);
  }, []);

  useEffect(() => {
    void reload().catch(() => undefined);
  }, [reload]);

  const routineByTask = useMemo(() => {
    const map = new Map<string, MobileRoutine>();
    for (const routine of routines) map.set(routine.task_id, routine);
    return map;
  }, [routines]);

  const undated = tasks.filter((task) => !routineByTask.has(task.id) && !task.due_on && !task.due_at);
  const dated = sortByDeadline(tasks.filter((task) => !routineByTask.has(task.id) && Boolean(task.due_on || task.due_at)));
  const recurringTasks = tasks.filter((task) => routineByTask.has(task.id));

  function openCreate() {
    setEditing(null);
    setTitle("");
    setNotes("");
    setDueOn("");
    setEstimate(null);
    setChecklistId(null);
    setRecurring(false);
    setWeekdays([0, 1, 2, 3, 4]);
    setTimeOfDay("");
    setScope("from_today");
    setOccurrenceOn(nextOccurrenceDate([0, 1, 2, 3, 4], today));
    setError("");
    setEditorOpen(true);
  }

  function openEdit(task: MobileTask) {
    const routine = routineByTask.get(task.id);
    setEditing(task);
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setDueOn(task.due_on ?? "");
    setEstimate(task.estimate_minutes ?? null);
    setChecklistId(task.checklist_id ?? null);
    setRecurring(Boolean(routine));
    setWeekdays(routine?.weekdays ?? [0, 1, 2, 3, 4]);
    setTimeOfDay(routine?.time_of_day?.slice(0, 5) ?? "");
    setScope("from_today");
    setOccurrenceOn(nextOccurrenceDate(routine?.weekdays ?? [0, 1, 2, 3, 4], today));
    setError("");
    setMenuTask(null);
    setEditorOpen(true);
  }

  async function save() {
    const clean = title.trim();
    if (!clean) {
      setError("חסר שם למשימה.");
      return;
    }
    if (recurring && weekdays.length === 0) {
      setError("בחרי לפחות יום אחד.");
      return;
    }
    if (recurring && editing && scope === "once" && !timeOfDay) {
      setError("רק הפעם צריך שעה.");
      return;
    }
    setError("");
    try {
      let taskId = editing?.id;
      if (!editing) {
        const created = await createTask(clean, {
          notes: notes.trim() || undefined,
          dueOn: dueOn || undefined,
          estimateMinutes: estimate ?? undefined,
          checklistId: checklistId ?? undefined,
        });
        taskId = created.results?.find((result) => result.ok && result.id)?.id;
      } else {
        await updateTask(editing.id, {
          title: clean,
          notes: notes.trim(),
          due_patch: dueOn ? "set" : "clear",
          ...(dueOn ? { due_on: dueOn } : {}),
          estimate_patch: estimate ? "set" : "clear",
          ...(estimate ? { estimate_minutes: estimate } : {}),
          checklist_patch: checklistId ? "set" : "clear",
          ...(checklistId ? { checklist_id: checklistId } : {}),
        });
      }
      if (!taskId) throw new Error("המשימה לא נשמרה.");
      const existing = routineByTask.get(taskId);
      const occurrenceDate = recurring
        ? (occurrenceOn || nextOccurrenceDate(weekdays, today))
        : today;
      if (recurring && !existing) {
        await createRoutine({
          taskId,
          weekdays,
          timeOfDay: timeOfDay || null,
          startsOn: today,
        });
      } else if (recurring && existing) {
        await updateRoutine({
          id: existing.id,
          weekdays,
          timeOfDay: timeOfDay || null,
          seriesScope: scope,
          occurrenceDate,
        });
      } else if (!recurring && existing) {
        await stopRoutine(existing.id, today);
      }
      setEditorOpen(false);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "השמירה נכשלה.");
    }
  }

  async function runMenu(action: () => Promise<unknown>) {
    const current = menuTask;
    setMenuTask(null);
    try {
      await action();
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "הפעולה נכשלה.");
    }
    return current;
  }

  function checklistPreview(task: MobileTask) {
    const list = checklists.find((item) => item.id === task.checklist_id);
    if (!list) return null;
    const routine = routineByTask.get(task.id);
    return (
      <Pressable
        onPress={() =>
          onOpenChecklist?.(
            list.id,
            routine ? routineOccurrenceKey(routine.id, today) : undefined,
          )
        }
      >
        <Text style={styles.preview}>{list.title}</Text>
        {list.items.slice(0, 2).map((item) => (
          <Text key={item.id} style={styles.previewItem}>
            {item.checked ? "✓" : "○"} {item.text}
          </Text>
        ))}
      </Pressable>
    );
  }

  function taskCard(task: MobileTask) {
    const routine = routineByTask.get(task.id);
    const done = task.status === "done";
    return (
      <View key={task.id} style={styles.card}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          onPress={() => {
            const occurrence = routine ? today : undefined;
            void (done ? reopenTask(task.id, occurrence) : completeTask(task.id, occurrence)).then(reload);
          }}
        >
          <PackStateIcon checked={done} size={24} />
        </Pressable>
        <View style={styles.cardBody}>
          <Text style={styles.taskTitle}>{task.title}</Text>
          {task.notes ? <Text style={styles.note}>{task.notes}</Text> : null}
          <View style={styles.meta}>
            {task.due_on ? <Text style={styles.metaText}>עד {formatDisplayDate(task.due_on)}</Text> : <Text style={styles.metaMuted}>ללא דדליין</Text>}
            {task.estimate_minutes ? <Text style={styles.metaText}>{task.estimate_minutes} דק׳</Text> : null}
            {routine ? (
              <View style={styles.recurBadge}>
                <PackActionIcon name="repeat" size={14} />
                <Text style={styles.metaText}>
                  {weekdayLabel(routine.weekdays)} · {clockLabel(routine.time_of_day)}
                </Text>
              </View>
            ) : null}
          </View>
          {checklistPreview(task)}
        </View>
        <Pressable accessibilityLabel="פעולות נוספות" onPress={() => setMenuTask(task)} style={styles.more}>
          <PackActionIcon name="more" size={18} />
        </Pressable>
      </View>
    );
  }

  function section(label: string, rows: MobileTask[], hint?: string) {
    if (!rows.length && filter !== "all") return null;
    if (!rows.length) {
      return hint ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{label}</Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
      ) : null;
    }
    return (
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{label}</Text>
          <Text style={styles.sectionCount}>{rows.length}</Text>
        </View>
        {rows.map(taskCard)}
      </View>
    );
  }

  const showUndated = filter === "all" || filter === "undated";
  const showDated = filter === "all" || filter === "dated";
  const showRoutine = filter === "all" || filter === "routine";
  const menuRoutine = menuTask ? routineByTask.get(menuTask.id) : undefined;

  return (
    <AppScreen scroll={false} padded={false} decor={false}>
      <BotanicalBackdrop />
      <View style={styles.page}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="משימה חדשה" onPress={openCreate} style={styles.add}>
            <Text style={styles.addPlus}>＋</Text>
          </Pressable>
          <Text style={styles.screenTitle}>משימות</Text>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={12} style={styles.hit} accessibilityLabel="חזרה">
              <Text style={styles.hitGlyph}>‹</Text>
            </Pressable>
          ) : (
            <View style={styles.hit} />
          )}
        </View>
        <Text style={styles.sub}>כל הדברים שחשוב לזכור במקום אחד</Text>
        <View style={styles.chips}>
          {([
            ["all", "הכל"],
            ["undated", "ללא דדליין"],
            ["dated", "עם דדליין"],
            ["routine", "קבועות"],
          ] as const).map(([id, label]) => (
            <Pressable key={id} onPress={() => setFilter(id)} style={[styles.filter, filter === id && styles.filterOn]}>
              <Text style={[styles.filterText, filter === id && styles.filterTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={styles.list}>
          {showUndated ? section("ללא דדליין", undated, dated.length ? `${dated.length} עם דדליין למטה` : undefined) : null}
          {showDated ? section("עם דדליין", dated) : null}
          {showRoutine ? section("משימות קבועות", recurringTasks) : null}
          {showUndated && showDated && showRoutine && tasks.length === 0 ? (
            <EmptyState title="אין עדיין משימות" body="לחצי על + כדי להוסיף משימה." />
          ) : null}
          {error && !editorOpen ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      </View>

      <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={() => setEditorOpen(false)}>
        <View style={styles.backdrop}>
          <ScrollView style={styles.modal} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{editing ? "עריכת משימה" : "משימה חדשה"}</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="מה צריך לעשות?" placeholderTextColor={CL.secondary} style={styles.input} textAlign="right" />
            <TextInput value={notes} onChangeText={setNotes} placeholder="הערה" placeholderTextColor={CL.secondary} style={[styles.input, styles.multiline]} multiline textAlign="right" />
            <DateTimeField label="דדליין — לא שעה בלוז" mode="date" value={dueOn} emptyLabel="בלי דדליין" onChange={setDueOn} />
            <Text style={styles.fieldLabel}>משך משוער</Text>
            <View style={styles.wrap}>
              {ESTIMATES.map((minutes) => (
                <Pressable key={minutes} onPress={() => setEstimate(estimate === minutes ? null : minutes)} style={[styles.chip, estimate === minutes && styles.chipOn]}>
                  <Text style={styles.chipText}>{minutes}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>צ׳קליסט</Text>
            <View style={styles.wrap}>
              <Pressable onPress={() => setChecklistId(null)} style={[styles.chip, !checklistId && styles.chipOn]}>
                <Text style={styles.chipText}>בלי</Text>
              </Pressable>
              {checklists.map((list) => (
                <Pressable key={list.id} onPress={() => setChecklistId(list.id)} style={[styles.chip, checklistId === list.id && styles.chipOn]}>
                  <Text style={styles.chipText}>{list.title}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setRecurring((value) => !value)} style={styles.recurRow}>
              <Text style={styles.fieldLabel}>חזרה</Text>
              <Text style={styles.metaText}>{recurring ? "פעילה" : "כבויה"}</Text>
            </Pressable>
            {recurring ? (
              <View>
                <View style={styles.wrap}>
                  <Pressable onPress={() => setWeekdays([0, 1, 2, 3, 4, 5, 6])} style={styles.chip}><Text style={styles.chipText}>כל יום</Text></Pressable>
                  <Pressable onPress={() => setWeekdays([0, 1, 2, 3, 4])} style={styles.chip}><Text style={styles.chipText}>א׳–ה׳</Text></Pressable>
                </View>
                <View style={styles.wrap}>
                  {WEEKDAYS.map((item) => (
                    <Pressable
                      key={item.day}
                      onPress={() =>
                        setWeekdays((current) =>
                          current.includes(item.day) ? current.filter((day) => day !== item.day) : [...current, item.day].sort(),
                        )
                      }
                      style={[styles.chip, weekdays.includes(item.day) && styles.chipOn]}
                    >
                      <Text style={styles.chipText}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <DateTimeField label="שעה בלוז, או ריק בלי שיבוץ" mode="time" value={timeOfDay} emptyLabel="בלי שעה" onChange={setTimeOfDay} />
                {editing ? (
                  <View style={styles.wrap}>
                    <Pressable onPress={() => setScope("once")} style={[styles.chip, scope === "once" && styles.chipOn]}>
                      <Text style={styles.chipText}>רק הפעם</Text>
                    </Pressable>
                    <Pressable onPress={() => setScope("from_today")} style={[styles.chip, scope === "from_today" && styles.chipOn]}>
                      <Text style={styles.chipText}>מהיום והלאה</Text>
                    </Pressable>
                  </View>
                ) : null}
                {editing && scope === "once" ? (
                  <DateTimeField label="תאריך המופע — רק הפעם" mode="date" value={occurrenceOn} emptyLabel="המופע הבא" onChange={setOccurrenceOn} />
                ) : null}
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <Pressable onPress={() => setEditorOpen(false)}><Text style={styles.cancel}>ביטול</Text></Pressable>
              <Pressable onPress={() => void save()} style={styles.save}><Text style={styles.saveText}>שמירה</Text></Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={Boolean(menuTask)} transparent animationType="fade" onRequestClose={() => setMenuTask(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuTask(null)}>
          <View style={styles.menu}>
            <Pressable onPress={() => menuTask && openEdit(menuTask)}><Text style={styles.menuItem}>עריכה</Text></Pressable>
            <Pressable onPress={() => menuTask && void runMenu(() => duplicateTask(menuTask.id))}><Text style={styles.menuItem}>שכפול</Text></Pressable>
            {menuRoutine ? (
              <>
                <Pressable onPress={() => menuRoutine && void runMenu(() => routineException({ id: menuRoutine.id, date: today, kind: "skip" }))}>
                  <Text style={styles.menuItem}>דלגי רק הפעם</Text>
                </Pressable>
                <Pressable onPress={() => menuTask && void runMenu(() => completeTask(menuTask.id, today))}>
                  <Text style={styles.menuItem}>סמני רק את המופע של היום</Text>
                </Pressable>
                <Pressable onPress={() => menuRoutine && void runMenu(() => stopRoutine(menuRoutine.id, today))}>
                  <Text style={styles.menuItem}>הפסיקי מהיום והלאה</Text>
                </Pressable>
              </>
            ) : null}
            <Pressable onPress={() => menuTask && void runMenu(() => deleteTask(menuTask.id))}>
              <Text style={[styles.menuItem, styles.danger]}>מחיקה</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 20 },
  topBar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", minHeight: 56, marginBottom: 4, zIndex: 2 },
  screenTitle: { fontFamily: heebo("700"), fontSize: 28, color: CL.text, textAlign: "center", flex: 1 },
  hit: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  hitGlyph: { fontFamily: heebo("500"), fontSize: 28, color: CL.text, lineHeight: 32 },
  sub: { fontFamily: heebo("400"), fontSize: 14, color: CL.secondary, textAlign: "right", marginBottom: 14, zIndex: 2 },
  add: { width: 52, height: 52, borderRadius: 26, backgroundColor: CL.terracotta, alignItems: "center", justifyContent: "center" },
  addPlus: { color: "#FFFDF9", fontSize: 28, lineHeight: 30 },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 16, zIndex: 2 },
  filter: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CL.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    backgroundColor: CL.surface,
    flexShrink: 0,
  },
  filterOn: { backgroundColor: CL.terracotta, borderColor: CL.terracotta },
  filterText: { fontFamily: heebo("600"), fontSize: 14, color: CL.text, writingDirection: "rtl" },
  filterTextOn: { color: "#FFFDF9" },
  list: { gap: 16, paddingBottom: 48 },
  section: { gap: 8 },
  sectionHead: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontFamily: heebo("700"), fontSize: 16, color: CL.text, textAlign: "right" },
  sectionCount: { fontFamily: heebo("500"), fontSize: 12, color: CL.terracotta },
  hint: { fontFamily: heebo("400"), fontSize: 12, color: CL.secondary, textAlign: "right" },
  card: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: "rgba(255,253,249,0.92)",
    borderWidth: 1,
    borderColor: CL.border,
  },
  cardBody: { flex: 1 },
  taskTitle: { fontFamily: heebo("700"), fontSize: 15, color: CL.text, textAlign: "right" },
  note: { fontFamily: heebo("400"), fontSize: 12, color: CL.secondary, textAlign: "right", marginTop: 4 },
  meta: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 8, alignItems: "center" },
  metaText: { fontFamily: heebo("500"), fontSize: 12, color: CL.terracotta },
  metaMuted: { fontFamily: heebo("400"), fontSize: 12, color: CL.secondary },
  recurBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  preview: { fontFamily: heebo("700"), fontSize: 12, textAlign: "right", marginTop: 8, color: CL.text },
  previewItem: { fontFamily: heebo("400"), fontSize: 12, color: CL.secondary, textAlign: "right" },
  more: { paddingHorizontal: 6, paddingTop: 4 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(58,47,40,0.28)" },
  modal: { maxHeight: "88%", backgroundColor: CL.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22 },
  modalTitle: { fontFamily: heebo("700"), fontSize: 24, color: CL.text, textAlign: "right", marginBottom: 12 },
  input: { minHeight: 52, borderRadius: 24, borderWidth: 1, borderColor: CL.border, paddingHorizontal: 16, color: CL.text, backgroundColor: CL.surface, marginBottom: 10, fontFamily: heebo("400"), fontSize: 15 },
  multiline: { minHeight: 80, textAlignVertical: "top", paddingTop: 12 },
  fieldLabel: { fontFamily: heebo("500"), fontSize: 12, color: CL.secondary, textAlign: "right", marginBottom: 8 },
  wrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { borderRadius: 16, borderWidth: 1, borderColor: CL.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: CL.surface },
  chipOn: { backgroundColor: CL.peach, borderColor: CL.terracotta },
  chipText: { fontFamily: heebo("500"), fontSize: 12, color: CL.text },
  recurRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  actions: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginVertical: 12 },
  cancel: { fontFamily: heebo("500"), color: CL.secondary, fontSize: 15 },
  save: { backgroundColor: CL.terracotta, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 18 },
  saveText: { fontFamily: heebo("700"), color: "#FFFDF9", fontSize: 15 },
  error: { fontFamily: heebo("400"), color: CL.danger, textAlign: "right", marginTop: 8 },
  menu: { backgroundColor: CL.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, gap: 8 },
  menuItem: { fontFamily: heebo("500"), fontSize: 16, color: CL.text, textAlign: "right", paddingVertical: 12 },
  danger: { color: CL.danger },
});
