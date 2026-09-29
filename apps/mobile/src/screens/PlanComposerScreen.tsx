import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { BackHandler, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen, PrimaryActionButton, ScreenHeader } from "../components/ui";
import {
  getDayPlan,
  jerusalemDateFromNow,
  replanDay,
  formatPlanTime,
  selectOpenTaskIdsForDate,
  type MobileDayPlan,
} from "../api/planning";
import { listTasks, type MobileTask } from "../api/tasks";
import { useKeyboardOpen } from "../layout/keyboard";
import { FREETIME_DEFAULT_MINUTES } from "../product/surfaceCommit";
import type { FreeTimeEnergy } from "../product/freeTimeCandidates";
import { colors as baseColors, rtlText, type as baseType } from "../theme";

const colors = {
  ...baseColors,
  muted: baseColors.textMuted,
  border: baseColors.line,
  accentDark: baseColors.accentDeep,
  successSoft: baseColors.sage,
};
const type = { ...baseType, h2: baseType.title };

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(`${date}T12:00:00+03:00`));

const dateObject = (date: string) => new Date(`${date}T12:00:00+03:00`);

const toJerusalemYmd = (value: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

const timeValue = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const minutesBetween = (start: string, end: string) => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
};

const DEFAULT_START = "07:00";
const DEFAULT_END = "19:00";

export function PlanComposerScreen({
  mode,
  onBack,
  onDone,
}: {
  mode: "plan" | "freetime";
  onBack: () => void;
  onDone: (payload: {
    kind: "success" | "schedule" | "freetime";
    minutes: number;
    date: string;
    energy?: FreeTimeEnergy | null;
  }) => void;
}) {
  const [selectedDate, setSelectedDate] = useState(jerusalemDateFromNow());
  const [plan, setPlan] = useState<MobileDayPlan | null>(null);
  const [tasks, setTasks] = useState<MobileTask[]>([]);
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);
  const [context, setContext] = useState("");
  const [picker, setPicker] = useState<"date" | "start" | "end" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [freeMinutes, setFreeMinutes] = useState(FREETIME_DEFAULT_MINUTES);
  const [energy, setEnergy] = useState<FreeTimeEnergy | null>(null);
  const planMode = mode === "plan";
  const keyboardOpen = useKeyboardOpen();
  const contextInputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    const [nextPlan, nextTasks] = await Promise.all([getDayPlan(selectedDate), listTasks()]);
    setPlan(nextPlan);
    setTasks(nextTasks.tasks);
    return nextPlan;
  }, [selectedDate]);

  useEffect(() => {
    setSavedNotice("");
    setError("");
    void load().catch((e) => setError(e instanceof Error ? e.message : "לא הצלחנו לטעון את היום"));
  }, [load]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (keyboardOpen) {
        contextInputRef.current?.blur();
        Keyboard.dismiss();
        return true;
      }
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [keyboardOpen, onBack]);

  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const available = Math.max(0, minutesBetween(start, end));
  const today = jerusalemDateFromNow(0);
  const tomorrow = jerusalemDateFromNow(1);
  const otherSelected = selectedDate !== today && selectedDate !== tomorrow;

  const choosePicker = (event: DateTimePickerEvent, value?: Date) => {
    const kind = picker;
    setPicker(null);
    if (event.type !== "set" || !value) return;
    if (kind === "date") setSelectedDate(toJerusalemYmd(value));
    else if (kind === "start") setStart(timeValue(value));
    else setEnd(timeValue(value));
  };

  function itemKindLabel(item: MobileDayPlan["items"][number]) {
    if (item.occurrence_key || item.routine_id) return "שגרה";
    if (item.kind === "fixed" || item.source === "calendar") return "קבוע";
    return "גמיש";
  }

  async function submit() {
    if (!planMode) {
      onDone({ kind: "freetime", minutes: freeMinutes, date: selectedDate, energy });
      return;
    }
    if (minutesBetween(start, end) <= 0) {
      setError("שעת ההתחלה חייבת להיות לפני שעת הסיום.");
      setSavedNotice("");
      return;
    }
    setBusy(true);
    setError("");
    setSavedNotice("");
    try {
      const alreadyOnPlan = (plan?.items ?? []).map((item) => item.task_id);
      const taskIds = selectOpenTaskIdsForDate(tasks, selectedDate, alreadyOnPlan);
      await replanDay(selectedDate, {
        taskIds,
        windowStart: start,
        windowEnd: end,
        planningContext: context.trim() || undefined,
        planUpdatedAt: plan?.plan?.updated_at,
      });
      // Success only after DB commit + reload of canonical day_plan.
      const reloaded = await load();
      if (!reloaded?.plan) {
        throw new Error("השמירה לא אושרה — הלו״ז לא נטען מחדש מהשרת.");
      }
      setSavedNotice("הלו״ז עודכן ונשמר.");
      // Stay on this screen — do not navigate to Home / success overlay.
    } catch (e) {
      setSavedNotice("");
      setError(e instanceof Error ? e.message : "התכנון נכשל");
    } finally {
      setBusy(false);
    }
  }

  const chips = [
    { label: "היום", date: today },
    { label: "מחר", date: tomorrow },
  ];

  return (
    <AppScreen
      footerOwnsBottomInset
      footer={
        <View style={styles.footer}>
          <PrimaryActionButton
            label={
              !planMode
                ? "הצג הצעות"
                : busy
                ? "מסדר לך את היום..."
                : plan?.items.length
                  ? "שנה לי את הלו״ז"
                  : "צור לי לו״ז"
            }
            onPress={() => void submit()}
            disabled={busy}
          />
        </View>
      }
    >
      <ScreenHeader
        title={planMode ? (plan?.items.length ? "שנה לי את הלו״ז" : "צור לי לו״ז") : "יש לי זמן פנוי"}
        onBack={onBack}
        icon="calendar-outline"
      />
      <Text style={styles.subtitle}>
        {planMode
          ? "בוחרים תאריך, רואים מה כבר קיים, ואז בונים מחדש על ה־day_plan השמור."
          : "כמה זמן יש לך עכשיו? נציע כמה משימות מתאימות בלי לשנות את הלו״ז."}
      </Text>

      {!planMode ? (
        <>
          <Text style={styles.heading}>כמה זמן פנוי יש לך?</Text>
          <View style={styles.dateRow}>
            {[15, 30, 60].map((minutes) => (
              <Pressable
                key={minutes}
                style={[styles.dateCard, freeMinutes === minutes && styles.selected]}
                onPress={() => setFreeMinutes(minutes)}
              >
                <Text style={styles.dateTitle}>{minutes} דקות</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.heading}>רמת אנרגיה (אופציונלי)</Text>
          <View style={styles.dateRow}>
            {([
              ["low", "נמוכה"],
              ["medium", "בינונית"],
              ["high", "גבוהה"],
            ] as const).map(([value, label]) => (
              <Pressable
                key={value}
                style={[styles.dateCard, energy === value && styles.selected]}
                onPress={() => setEnergy(energy === value ? null : value)}
              >
                <Text style={styles.dateTitle}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {planMode ? <Text style={styles.heading}>לאיזה יום?</Text> : null}
      {planMode ? (
      <View style={styles.dateRow}>
        {chips.map((chip) => (
          <Pressable
            key={chip.date}
            style={[styles.dateCard, selectedDate === chip.date && styles.selected]}
            onPress={() => setSelectedDate(chip.date)}
          >
            <Text style={styles.dateTitle}>{chip.label}</Text>
            <Text style={styles.dateText}>{dateLabel(chip.date)}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.dateCard, otherSelected && styles.selected]}
          onPress={() => setPicker("date")}
        >
          <Text style={styles.dateTitle}>יום אחר</Text>
          <Text style={styles.dateText}>
            {otherSelected ? dateLabel(selectedDate) : "בחר תאריך"}
          </Text>
        </Pressable>
      </View>
      ) : null}

      {planMode ? <Text style={styles.heading}>מה כבר ביום הזה?</Text> : null}
      {planMode ? (
      <View style={styles.card}>
        {plan?.items.length ? (
          plan.items.map((item) => (
            <View key={item.id ?? `${item.task_id}-${item.start_at}`} style={styles.planRow}>
              <Text style={styles.time}>{formatPlanTime(item.start_at)}</Text>
              <Text style={styles.itemTitle}>{taskMap.get(item.task_id)?.title ?? "משימה"}</Text>
              <Text style={styles.kind}>{itemKindLabel(item)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>אין עדיין פריטים ביום הזה</Text>
        )}
      </View>
      ) : null}

      {planMode ? <Text style={styles.heading}>שעות היום</Text> : null}
      {planMode ? (
      <View style={styles.card}>
        <View style={styles.timeRow}>
          <Pressable style={styles.timeBox} onPress={() => setPicker("end")}>
            <Text style={styles.label}>שעת סיום</Text>
            <Text style={styles.timeValue}>{end}</Text>
          </Pressable>
          <Pressable style={styles.timeBox} onPress={() => setPicker("start")}>
            <Text style={styles.label}>שעת התחלה</Text>
            <Text style={styles.timeValue}>{start}</Text>
          </Pressable>
        </View>
        <Text style={styles.duration}>
          ◷ טווח לתכנון: {available > 0 ? `${(available / 60).toFixed(1)} שעות` : "טווח לא תקין"}
        </Text>
      </View>
      ) : null}

      {planMode ? (
        <>
          <Text style={styles.heading}>מה חשוב / שונה לך היום?</Text>
          <TextInput
            ref={contextInputRef}
            style={styles.context}
            multiline
            value={context}
            onChangeText={setContext}
            placeholder="החוג בוטל היום, יש שעה פנויה"
            textAlign="right"
            textAlignVertical="top"
          />
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {savedNotice ? <Text style={styles.saved}>{savedNotice}</Text> : null}

      {picker ? (
        <DateTimePicker
          value={
            picker === "date"
              ? dateObject(selectedDate)
              : new Date(
                  2020,
                  0,
                  1,
                  Number((picker === "start" ? start : end).split(":")[0]),
                  Number((picker === "start" ? start : end).split(":")[1]),
                )
          }
          mode={picker === "date" ? "date" : "time"}
          is24Hour
          onChange={choosePicker}
        />
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  subtitle: { ...type.body, ...rtlText, color: colors.muted, marginBottom: 16 },
  dateRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 18 },
  dateCard: {
    flex: 1,
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.accent },
  dateTitle: { ...type.body, ...rtlText },
  dateText: { ...type.caption, ...rtlText, color: colors.muted },
  heading: { ...type.h2, ...rtlText, marginTop: 14, marginBottom: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  planRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  time: { width: 64, color: colors.muted },
  itemTitle: { flex: 1, ...type.body, ...rtlText },
  kind: { ...type.caption, color: colors.muted },
  empty: { ...rtlText, color: colors.muted, paddingVertical: 10 },
  timeRow: { flexDirection: "row-reverse", gap: 10 },
  timeBox: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12 },
  label: { ...type.caption, ...rtlText, color: colors.muted },
  timeValue: { ...type.h2, ...rtlText, marginTop: 6 },
  duration: {
    ...rtlText,
    color: colors.accentDark,
    backgroundColor: colors.successSoft,
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
    textAlign: "center",
  },
  context: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
    padding: 14,
    ...type.body,
  },
  footer: { paddingHorizontal: 24, paddingBottom: 12 },
  error: { ...rtlText, color: "#8B2E1F", marginTop: 12, marginBottom: 8 },
  saved: { ...rtlText, color: colors.accentDark, marginTop: 12, marginBottom: 8, fontWeight: "700" },
});
