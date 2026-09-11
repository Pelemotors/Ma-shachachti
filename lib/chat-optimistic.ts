import type { ChatSurface } from "./home-surfaces.ts";
import type { SurfaceContext } from "./chat-request.ts";

export type PendingChatTurn = {
  turnId: string;
  message: string;
  surface: ChatSurface | null;
  surfaceContext: SurfaceContext | null;
};

export function createPendingChatTurn(
  message: string,
  surface: ChatSurface | null,
  turnId = crypto.randomUUID(),
  surfaceContext: SurfaceContext | null = null,
): PendingChatTurn {
  return { turnId, message, surface, surfaceContext };
}

export function chatTurnRequest(
  turn: PendingChatTurn,
  sessionId: string | null,
) {
  return {
    message: turn.message,
    surface: turn.surface,
    surface_context: turn.surfaceContext,
    session_id: sessionId,
    turn_id: turn.turnId,
  };
}
