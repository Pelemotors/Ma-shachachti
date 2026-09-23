import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { completeTask, createTask } from "../../api/tasks";
import type { ProductTab } from "../../components/ui";
import { HomeBottomNavigation } from "../home-v4/HomeBottomNavigation";
import { heebo, homeScale, V4 } from "../home-v4/homeV4Theme";
import { ProductV4Header } from "../product-v4/ProductV4Header";
import { ForgotV4Icon } from "./forgotV4Icons";
import { FORGOT_V4_VISUAL_QA, forgotV4Fixture } from "./forgotV4Fixture";
import { useForgotV4Data } from "./useForgotV4Data";
import type { ForgottenIcon, ForgottenItem, ForgottenSection } from "../../api/forgot";

const SECTION_TINT: Record<ForgottenSection["id"], string> = {
  today: "#F7EDDD",
  week: "#F0E8DE",
  later: "#F7E6D6",
};

const SECTION_ICON: Record<ForgottenSection["id"], ForgottenIcon> = {
  today: "sun",
  week: "calendar",
  later: "gift",
};

export function ForgotV4Screen({
  width,
  onOpen,
  onTab,
}: {
  width: number;
  onOpen: (screen: string) => void;
  onTab: (tab: ProductTab) => void;
}) {
  const s = homeScale(width);
  const insets = useSafeAreaInsets();
  const data = useForgotV4Data();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  async function complete(id: string) {
    if (id.startsWith("qa-")) return;
    setActionError("");
    try {
      await completeTask(id);
      await data.reload({ silent: true });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "הסימון נכשל.");
    }
  }

  async function add() {
    const title = draft.trim();
    if (!title || busy) return;
    setBusy(true);
    setActionError("");
    try {
      await createTask(title);
      setDraft("");
      setAdding(false);
      await data.reload({ silent: true });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "לא הצלחנו להוסיף משימה.");
    } finally {
      setBusy(false);
    }
  }

  const subtitle = FORGOT_V4_VISUAL_QA && __DEV__ ? forgotV4Fixture.subtitle : "דברים שקל לשכוח מול העיניים";
  const count = data.sections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <View style={[styles.root, { backgroundColor: "#F7F2E7" }]}>
      <View style={{ height: insets.top, backgroundColor: "#F7F2E7" }} />
      <ProductV4Header
        scale={s}
        title="מה שכחתי?"
        subtitle={subtitle}
        avatarUrl={data.avatarUrl}
        unread={data.unread}
        onBell={() => onOpen("notifications")}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: 16 * s }}
        refreshControl={<RefreshControl refreshing={data.loading} onRefresh={() => void data.reload()} />}
      >
        {data.loading && count === 0 ? (
          <ActivityIndicator color={V4.sage} style={{ marginTop: 40 * s }} />
        ) : data.error && count === 0 ? (
          <Pressable onPress={() => void data.reload()} style={{ padding: 24 * s }}>
            <Text style={{ fontFamily: heebo("500"), color: V4.muted, textAlign: "center" }}>
              {data.error} נגיעה לרענון.
            </Text>
          </Pressable>
        ) : count === 0 ? (
          <Text
            style={{
              fontFamily: heebo("400"),
              fontSize: 14 * s,
              color: V4.muted,
              textAlign: "center",
              marginTop: 40 * s,
              paddingHorizontal: 24 * s,
            }}
          >
            כרגע אין משהו שנראה דחוף או שקל לפספס.
          </Text>
        ) : (
          data.sections.map((section) =>
            section.items.length === 0 ? null : (
              <View key={section.id}>
                <View
                  style={[
                    styles.sectionHead,
                    {
                      backgroundColor: SECTION_TINT[section.id],
                      paddingHorizontal: 20 * s,
                      paddingVertical: 10 * s,
                    },
                  ]}
                >
                  <ForgotV4Icon name={SECTION_ICON[section.id]} size={16 * s} color="#6A5E52" />
                  <Text
                    style={{
                      fontFamily: heebo("700"),
                      fontSize: 15 * s,
                      color: V4.text,
                      marginHorizontal: 8 * s,
                    }}
                  >
                    {section.title}
                  </Text>
                  <Text style={{ fontFamily: heebo("400"), fontSize: 12 * s, color: V4.muted }}>
                    · {section.items.length} פריטים
                  </Text>
                </View>
                {section.items.map((item) => (
                  <ForgotRow key={item.id} scale={s} item={item} onToggle={() => void complete(item.id)} />
                ))}
              </View>
            ),
          )
        )}
        {actionError ? (
          <Pressable onPress={() => setActionError("")}>
            <Text style={{ fontFamily: heebo("400"), color: "#B4534A", textAlign: "center", marginTop: 8 * s }}>
              {actionError} · נסי שוב
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <Pressable
        onPress={() => setAdding(true)}
        accessibilityLabel="הוסף משימה"
        style={[
          styles.cta,
          {
            height: 48 * s,
            borderRadius: 24 * s,
            marginHorizontal: 20 * s,
            marginBottom: 10 * s,
          },
        ]}
      >
        <ForgotV4Icon name="plus" size={16 * s} color="#F7F2E7" />
        <Text
          style={{
            fontFamily: heebo("600"),
            fontSize: 16 * s,
            color: "#F7F2E7",
            marginHorizontal: 8 * s,
          }}
        >
          הוסף משימה
        </Text>
      </Pressable>
      <HomeBottomNavigation scale={s} active="home" onChange={onTab} />
      <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
        <Pressable style={styles.modalBg} onPress={() => setAdding(false)}>
          <Pressable style={[styles.sheet, { padding: 20 * s }]} onPress={() => undefined}>
            <Text style={{ fontFamily: heebo("700"), fontSize: 18 * s, color: V4.text, textAlign: "right" }}>
              הוסף משימה
            </Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="מה לא לשכוח?"
              placeholderTextColor={V4.placeholder}
              style={[styles.input, { fontFamily: heebo("400"), fontSize: 15 * s, minHeight: 48 * s }]}
              textAlign="right"
            />
            <Pressable
              onPress={() => void add()}
              disabled={busy}
              style={[styles.cta, { height: 48 * s, borderRadius: 24 * s, opacity: busy ? 0.6 : 1 }]}
            >
              <Text style={{ fontFamily: heebo("600"), color: "#F7F2E7", fontSize: 16 * s }}>שמרי</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ForgotRow({
  scale,
  item,
  onToggle,
}: {
  scale: number;
  item: ForgottenItem;
  onToggle: () => void;
}) {
  const s = scale;
  return (
    <View style={[styles.row, { minHeight: 64 * s, paddingHorizontal: 20 * s }]}>
      <Pressable onPress={onToggle} accessibilityLabel={`סימון ${item.title}`} style={styles.checkHit}>
        <View style={[styles.check, { width: 22 * s, height: 22 * s, borderRadius: 6 * s }]} />
      </Pressable>
      <View style={styles.rowText}>
        <Text style={{ fontFamily: heebo("600"), fontSize: 15 * s, color: V4.text, textAlign: "right" }}>
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text style={{ fontFamily: heebo("400"), fontSize: 12 * s, color: V4.muted, textAlign: "right", marginTop: 2 * s }}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.iconCircle,
          { width: 36 * s, height: 36 * s, borderRadius: 18 * s },
        ]}
      >
        <ForgotV4Icon name={item.icon} size={18 * s} color="#6A5E52" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: "#FDFCF7" },
  checkHit: { padding: 8 },
  check: { borderWidth: 1.5, borderColor: "#C9C3BA", backgroundColor: "transparent" },
  rowText: { flex: 1, paddingHorizontal: 10 },
  iconCircle: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF8F1",
  },
  cta: {
    backgroundColor: "#5E6C52",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(39,31,29,0.28)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FDFCF7",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 12,
  },
  input: {
    backgroundColor: "#FAF9F5",
    borderRadius: 16,
    paddingHorizontal: 14,
    color: V4.text,
  },
});
