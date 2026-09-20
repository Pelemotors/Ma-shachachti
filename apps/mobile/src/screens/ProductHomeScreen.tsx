import { useState } from "react";
import { Dimensions, Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomNavBar, ChatComposer, HeroPetalActions, TaskRow, VoiceBankButton } from "../components/ui";
import type { ProductTab } from "../components/ui";
import { sendChat } from "../api/chat";
import { HOME_BOX, HOME_COLOR, HOME_TYPE, homeFrame } from "../product/homeGeometry";
import { HOME_QA_FIXTURE_ENABLED, homeQaNow } from "../product/homeQaFixture";

const BRANCH_TL = require("../../assets/ui/branch-from-master.png");
const BRANCH_BR = require("../../assets/ui/branch-bottom-right.png");

export function ProductHomeScreen({
  onOpen,
  displayName,
  onTab,
}: {
  onOpen: (screen: string) => void;
  displayName?: string | null;
  onTab?: (tab: ProductTab) => void;
}) {
  const { width, height } = Dimensions.get("window");
  const { s, ox, oy } = homeFrame(width, height);
  const [draft, setDraft] = useState("");

  async function send() {
    const message = draft.trim();
    if (!message) return;
    setDraft("");
    try {
      await sendChat(message);
      onOpen("chat");
    } catch {
      onOpen("chat");
    }
  }

  const abs = (x: number, y: number, w?: number, h?: number) => ({
    position: "absolute" as const,
    left: ox + x * s,
    top: oy + y * s,
    width: w != null ? w * s : undefined,
    height: h != null ? h * s : undefined,
  });

  const card = HOME_BOX.nowCard;
  const greeting = HOME_QA_FIXTURE_ENABLED
    ? homeQaNow.greeting
    : displayName
      ? `בוקר טוב, ${displayName}.`
      : "ערב טוב.";

  return (
    <View style={[styles.root, { width, height, backgroundColor: HOME_COLOR.page }]}>
      <Image
        source={BRANCH_TL}
        pointerEvents="none"
        resizeMode="contain"
        style={abs(HOME_BOX.branchTopLeft.x, HOME_BOX.branchTopLeft.y, HOME_BOX.branchTopLeft.w, HOME_BOX.branchTopLeft.h)}
      />
      <Image
        source={BRANCH_BR}
        pointerEvents="none"
        resizeMode="contain"
        style={[
          abs(
            HOME_BOX.branchBottomRight.x,
            HOME_BOX.branchBottomRight.y,
            HOME_BOX.branchBottomRight.w,
            HOME_BOX.branchBottomRight.h,
          ),
        ]}
      />

      <Text
        style={[
          styles.tag,
          abs(20, HOME_BOX.tagline.y, 350, HOME_BOX.tagline.h),
          { fontSize: HOME_TYPE.tagline.size * s, lineHeight: HOME_TYPE.tagline.line * s },
        ]}
      >
        {homeQaNow.tagline}
      </Text>
      <Text
        style={[
          styles.hi,
          abs(16, HOME_BOX.greeting.y, 358, HOME_BOX.greeting.h),
          { fontSize: HOME_TYPE.greeting.size * s, lineHeight: HOME_TYPE.greeting.line * s },
        ]}
      >
        {greeting}
      </Text>

      <View style={abs(HOME_BOX.hero.x, HOME_BOX.hero.y, HOME_BOX.hero.w, HOME_BOX.hero.h)}>
        <HeroPetalActions
          scale={s}
          originX={HOME_BOX.hero.x}
          originY={HOME_BOX.hero.y}
          onCenter={() => onOpen("forgot")}
          onPetal={onOpen}
          petals={[
            { id: "plan", label: "צור לי לו״ז", icon: "calendar-outline" },
            { id: "freetime", label: "יש לי\nזמן פנוי", icon: "time-outline" },
            { id: "checklists", label: "צ׳קליסטים", icon: "clipboard-outline" },
          ]}
        />
      </View>

      <View
        style={[
          styles.nowCard,
          abs(card.x, card.y, card.w, card.h),
          { borderRadius: card.radius * s },
        ]}
      >
        <Text
          style={[
            styles.nowTitle,
            {
              top: HOME_BOX.nowTitle.y * s,
              right: 20 * s,
              fontSize: HOME_TYPE.sectionTitle.size * s,
              lineHeight: HOME_TYPE.sectionTitle.line * s,
            },
          ]}
        >
          עכשיו אצלך
        </Text>
        <Text
          style={[
            styles.nowCap,
            {
              top: HOME_BOX.nowCaption.y * s,
              right: 20 * s,
              fontSize: HOME_TYPE.sectionMeta.size * s,
              lineHeight: HOME_TYPE.sectionMeta.line * s,
            },
          ]}
        >
          {homeQaNow.done} מתוך {homeQaNow.total} {homeQaNow.caption}
        </Text>
        <View
          style={[
            styles.track,
            {
              left: HOME_BOX.progress.x * s,
              top: HOME_BOX.progress.y * s,
              width: HOME_BOX.progress.w * s,
              height: HOME_BOX.progress.h * s,
            },
          ]}
        >
          <View style={[styles.fill, { width: `${(homeQaNow.done / homeQaNow.total) * 100}%` }]} />
        </View>
        <View
          style={{
            position: "absolute",
            left: HOME_BOX.row1.x * s,
            top: HOME_BOX.row1.y * s,
            width: HOME_BOX.row1.w * s,
            height: HOME_BOX.row1.h * s,
          }}
        >
          <TaskRow
            time="16:30"
            title="להכין ארוחת ערב"
            icon="restaurant-outline"
            homeMaster
            scale={s}
            onPress={() => onOpen("schedule")}
          />
        </View>
        <View
          style={{
            position: "absolute",
            left: HOME_BOX.row2.x * s,
            top: HOME_BOX.row2.y * s,
            width: HOME_BOX.row2.w * s,
            height: HOME_BOX.row2.h * s,
          }}
        >
          <TaskRow
            time="17:15"
            title="לאסוף הילדים מהגן"
            icon="people-outline"
            homeMaster
            scale={s}
            onPress={() => onOpen("schedule")}
          />
        </View>
      </View>

      <View style={[styles.more, abs(HOME_BOX.chevron.x, HOME_BOX.chevron.y, HOME_BOX.chevron.w, HOME_BOX.chevron.h)]}>
        <Ionicons name="chevron-down" size={Math.round(16 * s)} color={HOME_COLOR.muted} />
      </View>

      <View style={[styles.bankWrap, abs(HOME_BOX.bank.x, HOME_BOX.bank.y, HOME_BOX.bank.w, HOME_BOX.bank.h)]}>
        <VoiceBankButton onPress={() => onOpen("bank")} homeLock scale={s} />
      </View>

      <View style={abs(HOME_BOX.composer.x, HOME_BOX.composer.y, HOME_BOX.composer.w, HOME_BOX.composer.h)}>
        <ChatComposer value={draft} onChangeText={setDraft} onSend={() => void send()} homeLock scale={s} />
      </View>

      <View style={abs(HOME_BOX.nav.x, HOME_BOX.nav.y, HOME_BOX.nav.w, HOME_BOX.nav.h)}>
        <BottomNavBar
          active="home"
          flush
          onChange={(next) => {
            onTab?.(next);
            onOpen(next);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: "hidden" },
  tag: { textAlign: "center", color: HOME_COLOR.tagline, fontWeight: "400" },
  hi: { textAlign: "center", color: HOME_COLOR.text, fontWeight: "700" },
  nowCard: { backgroundColor: HOME_COLOR.nowCard, overflow: "hidden" },
  nowTitle: { position: "absolute", right: 20, textAlign: "right", color: HOME_COLOR.text, fontWeight: "700" },
  nowCap: { position: "absolute", right: 20, textAlign: "right", color: HOME_COLOR.muted },
  track: { position: "absolute", backgroundColor: HOME_COLOR.track, borderRadius: 99, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: HOME_COLOR.progress, borderRadius: 99 },
  more: { alignItems: "center", justifyContent: "center" },
  bankWrap: { alignItems: "center", justifyContent: "center" },
});
