import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchMediaUrl } from "@/lib/higgsfield/client";
import { assertSafeMediaUrl } from "@/lib/media/validate-proxy-url";
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

  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  let url: URL;
  try {
    url = assertSafeMediaUrl(raw);
  } catch {
    return NextResponse.json({ error: "Invalid or disallowed URL" }, { status: 400 });
  }

  try {
    const { body, contentType } = await fetchMediaUrl(url.toString());
    const maxBytes = 25 * 1024 * 1024;
    if (body.byteLength > maxBytes) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }
    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch media" }, { status: 502 });
  }
}
