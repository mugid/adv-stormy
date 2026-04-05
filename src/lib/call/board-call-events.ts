import { db } from "@/lib/db";
import { boardCallEvents } from "@/lib/db/schema";

export type BoardCallEventKind =
  | "agent_request_start"
  | "agent_request_complete"
  | "agent_request_error"
  | "call_join"
  | "call_leave"
  | "stt_final"
  | "call_error";

export async function logBoardCallEvent(input: {
  boardId: string;
  userId: string;
  kind: BoardCallEventKind;
  payload?: Record<string, unknown> | null;
  latencyMs?: number | null;
}) {
  try {
    await db.insert(boardCallEvents).values({
      boardId: input.boardId,
      userId: input.userId,
      kind: input.kind,
      payload: input.payload ?? null,
      latencyMs: input.latencyMs ?? null,
    });
  } catch (err) {
    console.error("[board-call-events]", err);
  }
}
