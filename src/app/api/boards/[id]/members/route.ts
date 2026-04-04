import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { boardMembers, user } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getBoardAccess } from "@/lib/boards/access";

async function getSessionUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: boardId } = await params;
  const access = await getBoardAccess(boardId, sessionUser.id);
  if (!access || access.role !== "owner") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await db
    .select({
      id: boardMembers.id,
      userId: boardMembers.userId,
      role: boardMembers.role,
      email: user.email,
      name: user.name,
    })
    .from(boardMembers)
    .innerJoin(user, eq(boardMembers.userId, user.id))
    .where(eq(boardMembers.boardId, boardId));

  return NextResponse.json({ members: rows });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: boardId } = await params;
  const access = await getBoardAccess(boardId, sessionUser.id);
  if (!access || access.role !== "owner") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role === "viewer" ? "viewer" : "editor";

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const [invited] = await db.select().from(user).where(eq(user.email, email));
  if (!invited) {
    return NextResponse.json(
      { error: "No user found with that email" },
      { status: 404 }
    );
  }

  if (invited.id === access.board.ownerId) {
    return NextResponse.json(
      { error: "Owner is already a member" },
      { status: 400 }
    );
  }

  const [existing] = await db
    .select()
    .from(boardMembers)
    .where(
      and(
        eq(boardMembers.boardId, boardId),
        eq(boardMembers.userId, invited.id)
      )
    );

  if (existing) {
    const [updated] = await db
      .update(boardMembers)
      .set({ role })
      .where(eq(boardMembers.id, existing.id))
      .returning();
    return NextResponse.json({ member: updated });
  }

  const [created] = await db
    .insert(boardMembers)
    .values({
      boardId,
      userId: invited.id,
      role,
    })
    .returning();

  return NextResponse.json({ member: created }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: boardId } = await params;
  const access = await getBoardAccess(boardId, sessionUser.id);
  if (!access || access.role !== "owner") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId query required" }, { status: 400 });
  }

  await db
    .delete(boardMembers)
    .where(
      and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId))
    );

  return NextResponse.json({ success: true });
}
