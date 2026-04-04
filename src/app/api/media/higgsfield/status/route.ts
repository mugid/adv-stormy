import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { mediaGenerationJobs } from "@/lib/db/schema";
import { getGenerationStatus } from "@/lib/higgsfield/client";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";

async function getSessionUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user ?? null;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestId = request.nextUrl.searchParams.get("requestId");
  if (!requestId) {
    return NextResponse.json({ error: "requestId required" }, { status: 400 });
  }

  const [job] = await db
    .select()
    .from(mediaGenerationJobs)
    .where(
      and(
        eq(mediaGenerationJobs.requestId, requestId),
        eq(mediaGenerationJobs.userId, user.id)
      )
    );

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const status = await getGenerationStatus(requestId);

    const terminal = ["completed", "failed", "nsfw"].includes(status.status);
    const images = status.images?.map((i) => i.url).filter(Boolean);
    const resultUrls =
      status.status === "completed"
        ? {
            images: images?.length ? images : undefined,
            video: status.video?.url,
          }
        : undefined;
    await db
      .update(mediaGenerationJobs)
      .set({
        status: status.status,
        ...(resultUrls !== undefined ? { resultUrls } : {}),
        errorMessage: status.error ?? job.errorMessage ?? null,
        updatedAt: new Date(),
      })
      .where(eq(mediaGenerationJobs.requestId, requestId));

    return NextResponse.json({
      status: status.status,
      requestId,
      images: images?.length ? images.map((url) => ({ url })) : status.images,
      video: status.video,
      error: status.error,
      terminal,
    });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Status failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
