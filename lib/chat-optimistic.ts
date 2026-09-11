import type { ChatSurface } from "./home-surfaces.ts";

export type PendingChatTurn = {
  turnId: string;
  message: string;
  surface: ChatSurface | null;
};

export function createPendingChatTurn(
  message: string,
  surface: ChatSurface | null,
  turnId = crypto.randomUUID(),
): PendingChatTurn {
  return { turnId, message, surface };
}

export function chatTurnRequest(
  turn: PendingChatTurn,
  sessionId: string | null,
) {
  return {
    message: turn.message,
    surface: turn.surface,
    session_id: sessionId,
    turn_id: turn.turnId,
  };
}
