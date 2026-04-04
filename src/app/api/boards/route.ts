import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { boards, boardMembers } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";

async function getUser(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user ?? null;
}

export async function GET(_request: NextRequest) {
  const user = await getUser(_request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const owned = await db
    .select()
    .from(boards)
    .where(eq(boards.ownerId, user.id));

  const memberRows = await db
    .select({ boardId: boardMembers.boardId })
    .from(boardMembers)
    .where(eq(boardMembers.userId, user.id));

  const memberIds = [...new Set(memberRows.map((r) => r.boardId))];
  const shared =
    memberIds.length > 0
      ? await db.select().from(boards).where(inArray(boards.id, memberIds))
      : [];

  const byId = new Map<string, (typeof owned)[number]>();
  for (const b of owned) byId.set(b.id, b);
  for (const b of shared) byId.set(b.id, b);

  const userBoards = [...byId.values()].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );

  return NextResponse.json(userBoards);
}

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const title = body.title ?? "Untitled Board";

  const [board] = await db
    .insert(boards)
    .values({
      title,
      ownerId: user.id,
    })
    .returning();

  await db.insert(boardMembers).values({
    boardId: board.id,
    userId: user.id,
    role: "editor",
  });

  return NextResponse.json(board, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const boardId = searchParams.get("id");
  if (!boardId) {
    return NextResponse.json({ error: "Board ID required" }, { status: 400 });
  }

  const [board] = await db
    .select()
    .from(boards)
    .where(eq(boards.id, boardId));

  if (!board || board.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(boards).where(eq(boards.id, boardId));

  return NextResponse.json({ success: true });
}
