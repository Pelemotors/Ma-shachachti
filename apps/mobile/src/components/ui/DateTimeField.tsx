import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { formatDisplayDate } from "../../api/planning";
import { heebo } from "../../screens/home-v4/homeV4Theme";
import { CL } from "../../product/checklistTokens";

function dateFromYmd(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function timeFromHm(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const next = new Date();
  next.setHours(hour || 0, minute || 0, 0, 0);
  return next;
}

export function DateTimeField({
  label,
  mode,
  value,
  emptyLabel,
  onChange,
}: {
  label: string;
  mode: "date" | "time";
  value: string;
  emptyLabel: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);

  function apply(_event: DateTimePickerEvent, picked?: Date) {
    setOpen(false);
    if (!picked) return;
    if (mode === "date") {
      const year = picked.getFullYear();
      const month = String(picked.getMonth() + 1).padStart(2, "0");
      const day = String(picked.getDate()).padStart(2, "0");
      onChange(`${year}-${month}-${day}`);
      return;
    }
    onChange(`${String(picked.getHours()).padStart(2, "0")}:${String(picked.getMinutes()).padStart(2, "0")}`);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable onPress={() => setOpen(true)} style={styles.field}>
          <Text style={[styles.value, !value && styles.empty]}>
            {value ? (mode === "date" ? formatDisplayDate(value) : value) : emptyLabel}
          </Text>
        </Pressable>
        {value ? (
          <Pressable onPress={() => onChange("")} accessibilityLabel="נקה">
            <Text style={styles.clear}>נקה</Text>
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <DateTimePicker
          value={mode === "date" ? dateFromYmd(value) : timeFromHm(value || "08:00")}
          mode={mode}
          is24Hour
          display="default"
          onChange={apply}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontFamily: heebo("500"), fontSize: 12, color: CL.secondary, textAlign: "right", marginBottom: 6 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  field: {
    flex: 1,
    minHeight: 52,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: CL.border,
    backgroundColor: CL.surface,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  value: { fontFamily: heebo("500"), fontSize: 15, color: CL.text, textAlign: "right" },
  empty: { color: CL.secondary },
  clear: { fontFamily: heebo("600"), color: CL.terracotta, fontSize: 13 },
});
