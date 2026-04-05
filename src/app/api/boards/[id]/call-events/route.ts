import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getBoardAccess } from "@/lib/boards/access";
import {
  logBoardCallEvent,
  type BoardCallEventKind,
} from "@/lib/call/board-call-events";

const ALLOWED_KINDS = new Set([
  "call_join",
  "call_leave",
  "stt_final",
  "call_error",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: boardId } = await params;
  const access = await getBoardAccess(boardId, session.user.id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!access.canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    kind?: string;
    payload?: Record<string, unknown>;
  };

  const kind = typeof body.kind === "string" ? body.kind : "";
  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  await logBoardCallEvent({
    boardId,
    userId: session.user.id,
    kind: kind as BoardCallEventKind,
    payload: body.payload ?? null,
  });

  return NextResponse.json({ ok: true });
}
