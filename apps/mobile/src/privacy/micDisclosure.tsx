import * as SecureStore from "expo-secure-store";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useRef, useState } from "react";

const KEY = "ma_mic_disclosure_v1";
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const MIC_DISCLOSURE_TITLE = "שימוש במיקרופון";
export const MIC_DISCLOSURE_BODY =
  "מה שכחתי? משתמשת במיקרופון רק כאשר אתה בוחר להקליט.\n\nההקלטה משמשת לתמלול ולהבנת הבקשה שלך, כדי ליצור או לעדכן משימות, תזכורות ומידע באפליקציה.\n\nההקלטה אינה מתחילה ללא פעולה שלך.";

export async function hasAcceptedMicDisclosure(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(KEY, OPTIONS)) === "1";
  } catch {
    return false;
  }
}

export async function acceptMicDisclosure(): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, "1", OPTIONS);
  } catch {
    // ignore
  }
}

export function MicDisclosureModal(props: {
  visible: boolean;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  return (
    <Modal visible={props.visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{MIC_DISCLOSURE_TITLE}</Text>
          <Text style={styles.body}>{MIC_DISCLOSURE_BODY}</Text>
          <Pressable style={styles.primary} onPress={props.onContinue}>
            <Text style={styles.primaryText}>המשך</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={props.onDismiss}>
            <Text style={styles.secondaryText}>לא עכשיו</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Gate before RECORD_AUDIO. Shows in-app disclosure once, then resolves.
 */
export function useMicDisclosureGate() {
  const [show, setShow] = useState(false);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  async function ensureAccepted(): Promise<boolean> {
    if (await hasAcceptedMicDisclosure()) return true;
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setShow(true);
    });
  }

  const modal = (
    <MicDisclosureModal
      visible={show}
      onContinue={() => {
        void acceptMicDisclosure().then(() => {
          setShow(false);
          resolveRef.current?.(true);
          resolveRef.current = null;
        });
      }}
      onDismiss={() => {
        setShow(false);
        resolveRef.current?.(false);
        resolveRef.current = null;
      }}
    />
  );

  return { ensureAccepted, modal };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#FFFDF9",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "right",
    color: "#3D2B1F",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "right",
    color: "#5C4033",
  },
  primary: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#8B5E3C",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondary: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: "#8A7464", fontSize: 15 },
});
