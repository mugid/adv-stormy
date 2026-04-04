import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { boards } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

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
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [board] = await db.select().from(boards).where(eq(boards.id, id));

  if (!board || board.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: board.id,
    title: board.title,
    sceneJson: board.sceneJson,
    updatedAt: board.updatedAt,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const sceneJson =
    typeof body.sceneJson === "string" ? body.sceneJson : undefined;
  const title = typeof body.title === "string" ? body.title : undefined;

  if (sceneJson === undefined && title === undefined) {
    return NextResponse.json(
      { error: "Provide sceneJson and/or title" },
      { status: 400 }
    );
  }

  const [board] = await db.select().from(boards).where(eq(boards.id, id));

  if (!board || board.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(boards)
    .set({
      ...(sceneJson !== undefined ? { sceneJson } : {}),
      ...(title !== undefined ? { title } : {}),
      updatedAt: new Date(),
    })
    .where(eq(boards.id, id))
    .returning();

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    updatedAt: updated.updatedAt,
  });
}
