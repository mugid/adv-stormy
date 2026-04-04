import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { mediaGenerationJobs } from "@/lib/db/schema";
import { headers } from "next/headers";
import { nanoid } from "nanoid";
import {
  getDefaultImageModel,
  getDefaultVideoModel,
  submitGeneration,
} from "@/lib/higgsfield/client";
import { getBoardAccess } from "@/lib/boards/access";
async function getSessionUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user ?? null;
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const kind = body.kind as string;
  if (kind !== "image" && kind !== "video") {
    return NextResponse.json({ error: "kind must be image or video" }, { status: 400 });
  }

  const boardId: string | null =
    typeof body.boardId === "string" && body.boardId.length > 0
      ? body.boardId
      : null;

  if (boardId) {
    const access = await getBoardAccess(boardId, user.id);
    if (!access?.canEdit) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }
  }

  try {
    if (kind === "image") {
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) {
        return NextResponse.json({ error: "prompt is required" }, { status: 400 });
      }
      const modelId =
        typeof body.modelId === "string" && body.modelId.length > 0
          ? body.modelId
          : getDefaultImageModel();
      const hfBody: Record<string, unknown> = { prompt };
      if (typeof body.aspect_ratio === "string") {
        hfBody.aspect_ratio = body.aspect_ratio;
      }
      if (typeof body.resolution === "string") {
        hfBody.resolution = body.resolution;
      }

      const submitted = await submitGeneration(modelId, hfBody);

      await db.insert(mediaGenerationJobs).values({
        id: nanoid(),
        requestId: submitted.request_id,
        userId: user.id,
        boardId,
        status: submitted.status ?? "queued",
        hfStatusUrl: submitted.status_url ?? null,
        payload: { kind: "image", modelId, ...hfBody },
        resultUrls: null,
        errorMessage: null,
        updatedAt: new Date(),
      });

      return NextResponse.json({
        requestId: submitted.request_id,
        statusUrl: submitted.status_url,
        cancelUrl: submitted.cancel_url,
      });
    }

    const imageUrl =
      typeof body.image_url === "string" ? body.image_url.trim() : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!imageUrl || !prompt) {
      return NextResponse.json(
        { error: "image_url and prompt are required for video" },
        { status: 400 }
      );
    }
    const modelId =
      typeof body.modelId === "string" && body.modelId.length > 0
        ? body.modelId
        : getDefaultVideoModel();
    const hfBody: Record<string, unknown> = {
      image_url: imageUrl,
      prompt,
    };
    if (typeof body.duration === "number" && Number.isFinite(body.duration)) {
      hfBody.duration = body.duration;
    }

    const submitted = await submitGeneration(modelId, hfBody);

    await db.insert(mediaGenerationJobs).values({
      id: nanoid(),
      requestId: submitted.request_id,
      userId: user.id,
      boardId,
      status: submitted.status ?? "queued",
      hfStatusUrl: submitted.status_url ?? null,
      payload: { kind: "video", modelId, ...hfBody },
      resultUrls: null,
      errorMessage: null,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      requestId: submitted.request_id,
      statusUrl: submitted.status_url,
      cancelUrl: submitted.cancel_url,
    });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Higgsfield request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
