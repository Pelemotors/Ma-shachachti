import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { getHousehold, householdAction, type HouseholdPayload } from "../api/household";
import { ErrorText, Field, Hint, PrimaryButton, ScreenShell } from "../ui/chrome";

export function HouseholdScreen({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<HouseholdPayload | null>(null);
  const [token, setToken] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setData(await getHousehold());
  }, []);

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : "שגיאה"));
  }, [reload]);

  async function run(action: "create" | "invite" | "accept" | "leave") {
    setBusy(true);
    setError("");
    try {
      const result = await householdAction(action, {
        title: "הבית",
        token: token.trim() || undefined,
      });
      if (result.token) setInvite(result.token);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "פעולה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell title="מרחב משותף" onBack={onBack}>
      <Hint>זוג בלבד. עזיבה מעבירה פריטים משותפים לבן הזוג שנשאר.</Hint>
      {data?.household ? (
        <>
          <Text style={styles.line}>{data.household.title}</Text>
          <Text style={styles.line}>חברים: {data.members.length}</Text>
          <PrimaryButton label="הזמן בן/בת זוג" onPress={() => void run("invite")} disabled={busy} />
          {invite ? <Text style={styles.invite}>קוד הזמנה (פעם אחת): {invite}</Text> : null}
          <PrimaryButton label="עזיבה" onPress={() => void run("leave")} disabled={busy} danger />
        </>
      ) : (
        <>
          <PrimaryButton label="יצירת מרחב" onPress={() => void run("create")} disabled={busy} />
          <Field value={token} onChangeText={setToken} placeholder="קוד הזמנה" />
          <PrimaryButton label="הצטרפות" onPress={() => void run("accept")} disabled={busy} />
        </>
      )}
      <ErrorText message={error} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  line: { textAlign: "right", color: "#3D2B1F", fontWeight: "600" },
  invite: { textAlign: "right", color: "#5C4033" },
});
