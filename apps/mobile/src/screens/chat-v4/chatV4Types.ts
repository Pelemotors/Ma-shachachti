import type { MobileChatMessage } from "../../api/chat";

export type ChatV4Row = MobileChatMessage & {
  pending?: boolean;
  failed?: boolean;
};
