import { Pressable, Text, View } from "react-native";
import { ChatTimestamp } from "./ChatTimestamp";
import { CHAT, heebo } from "./chatV4Theme";
import type { ChatV4Row } from "./chatV4Types";

export function ChatMessageUser({
  item,
  scale,
  onRetry,
}: {
  item: ChatV4Row;
  scale: number;
  onRetry?: () => void;
}) {
  const s = scale;
  return (
    <View style={{ width: "100%", paddingHorizontal: 16 * s, alignItems: "flex-end" }}>
    <View style={{ maxWidth: "82%" }}>
      <View
        style={{
          backgroundColor: item.failed ? CHAT.errorSoft : CHAT.userBubble,
          borderRadius: 20 * s,
          paddingHorizontal: 14 * s,
          paddingVertical: 12 * s,
        }}
      >
        <Text
          style={{
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
      <ChatTimestamp iso={item.created_at} scale={s} align="right" />
      {item.failed ? (
        <Pressable onPress={onRetry} accessibilityLabel="נסה שוב" style={{ marginTop: 4 * s }}>
          <Text
            style={{
              fontFamily: heebo("500"),
              fontSize: 12 * s,
              color: CHAT.error,
              textAlign: "right",
            }}
          >
            משהו השתבש. נסו שוב.
          </Text>
        </Pressable>
      ) : null}
    </View>
    </View>
  );
}
