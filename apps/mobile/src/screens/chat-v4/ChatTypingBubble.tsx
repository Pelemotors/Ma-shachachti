import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { AgentSparkle } from "./AgentSparkle";
import { CHAT, heebo } from "./chatV4Theme";

export function ChatTypingBubble({ scale }: { scale: number }) {
  const s = scale;
  const [dots, setDots] = useState(".");
  useEffect(() => {
    const id = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "." : `${prev}.`));
    }, 380);
    return () => clearInterval(id);
  }, []);
  return (
    <View
      accessibilityLabel="הסוכן כותב"
      style={{
        alignSelf: "flex-start",
        marginHorizontal: 16 * s,
        maxWidth: "50%",
        backgroundColor: CHAT.agentBubble,
        borderRadius: 20 * s,
        paddingHorizontal: 14 * s,
        paddingVertical: 12 * s,
        flexDirection: "row",
        alignItems: "center",
        gap: 8 * s,
        shadowColor: CHAT.shadow,
        shadowOpacity: 0.16,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 3 },
        elevation: 1,
      }}
    >
      <Text
        style={{
          fontFamily: heebo("500"),
          fontSize: 18 * s,
          color: CHAT.muted,
          letterSpacing: 2,
        }}
      >
        {dots}
      </Text>
      <AgentSparkle size={16 * s} />
    </View>
  );
}
