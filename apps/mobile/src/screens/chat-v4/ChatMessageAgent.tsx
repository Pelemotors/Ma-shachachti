import { Text, View } from "react-native";
import { AgentSparkle } from "./AgentSparkle";
import { ChatTimestamp } from "./ChatTimestamp";
import { CHAT, heebo } from "./chatV4Theme";
import type { ChatV4Row } from "./chatV4Types";

export function ChatMessageAgent({ item, scale }: { item: ChatV4Row; scale: number }) {
  const s = scale;
  return (
    <View style={{ width: "100%", paddingHorizontal: 16 * s }}>
      <View style={{ width: "86%", alignSelf: "flex-start" }}>
        <View
          style={{
            backgroundColor: CHAT.agentBubble,
            borderRadius: 20 * s,
            paddingHorizontal: 14 * s,
            paddingVertical: 12 * s,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8 * s,
            shadowColor: CHAT.shadow,
            shadowOpacity: 0.18,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 4 },
            elevation: 2,
          }}
        >
          <AgentSparkle size={16 * s} />
          <Text
            accessibilityLabel={item.content}
            style={{
              flex: 1,
              fontFamily: heebo("400"),
              fontSize: 14 * s,
              lineHeight: 20 * s,
              color: CHAT.text,
              textAlign: "right",
            }}
          >
            {item.content}
          </Text>
        </View>
        <ChatTimestamp iso={item.created_at} scale={s} align="left" />
      </View>
    </View>
  );
}
