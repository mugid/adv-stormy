import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { boards } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const access = await getBoardAccess(id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { board, role, canEdit } = access;

  return NextResponse.json({
    id: board.id,
    title: board.title,
    sceneJson: board.sceneJson,
    sceneFiles: board.sceneFiles,
    pinnedVideoUrl: board.pinnedVideoUrl,
    updatedAt: board.updatedAt,
    role,
    canEdit,
    ownerId: board.ownerId,
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
  const sceneFiles =
    body.sceneFiles !== undefined && body.sceneFiles !== null &&
    typeof body.sceneFiles === "object"
      ? (body.sceneFiles as Record<string, { url: string; mimeType: string }>)
      : undefined;

  let pinnedVideoUrl: string | null | undefined;
  if ("pinnedVideoUrl" in body) {
    if (body.pinnedVideoUrl === null) {
      pinnedVideoUrl = null;
    } else if (typeof body.pinnedVideoUrl === "string") {
      pinnedVideoUrl = body.pinnedVideoUrl;
    } else {
      return NextResponse.json(
        { error: "pinnedVideoUrl must be a string or null" },
        { status: 400 }
      );
    }
  }

  if (
    sceneJson === undefined &&
    title === undefined &&
    sceneFiles === undefined &&
    pinnedVideoUrl === undefined
  ) {
    return NextResponse.json(
      {
        error:
          "Provide sceneJson, sceneFiles, pinnedVideoUrl, and/or title",
      },
      { status: 400 }
    );
  }

  const access = await getBoardAccess(id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!access.canEdit) {
    return NextResponse.json(
      { error: "Viewer role cannot edit this board" },
      { status: 403 }
    );
  }

  const [updated] = await db
    .update(boards)
    .set({
      ...(sceneJson !== undefined ? { sceneJson } : {}),
      ...(sceneFiles !== undefined ? { sceneFiles } : {}),
      ...(pinnedVideoUrl !== undefined ? { pinnedVideoUrl } : {}),
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
