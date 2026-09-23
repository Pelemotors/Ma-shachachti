import { Text } from "react-native";
import { formatPlanTime } from "../../api/planning";
import { CHAT, heebo } from "./chatV4Theme";

export function ChatTimestamp({
  iso,
  scale,
  align,
}: {
  iso?: string;
  scale: number;
  align: "left" | "right";
}) {
  if (!iso) return null;
  return (
    <Text
      style={{
        fontFamily: heebo("400"),
        fontSize: 11 * scale,
        lineHeight: 14 * scale,
        color: CHAT.timestamp,
        textAlign: align,
        marginTop: 4 * scale,
        writingDirection: "ltr",
      }}
    >
      {formatPlanTime(iso)}
    </Text>
  );
}
