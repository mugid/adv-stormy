import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { AccessToken } from "livekit-server-sdk";
import { auth } from "@/lib/auth";
import { getBoardAccess } from "@/lib/boards/access";
import { livekitRoomNameForBoard } from "@/lib/call/livekit-room";

function livekitConfig() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url?.trim() || !apiKey?.trim() || !apiSecret?.trim()) {
    return null;
  }
  return { url: url.trim(), apiKey: apiKey.trim(), apiSecret: apiSecret.trim() };
}

export async function GET(
  _request: NextRequest,
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
    return NextResponse.json(
      { error: "Only editors can join board voice calls" },
      { status: 403 }
    );
  }

  const cfg = livekitConfig();
  if (!cfg) {
    return NextResponse.json(
      {
        error: "Voice calls are not configured",
        hint: "Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET",
      },
      { status: 503 }
    );
  }

  const roomName = livekitRoomNameForBoard(boardId);
  const identity = session.user.id;
  const name =
    session.user.name?.trim() ||
    session.user.email?.trim() ||
    "Collaborator";

  const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity,
    name,
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const jwt = await token.toJwt();

  return NextResponse.json({
    url: cfg.url,
    token: jwt,
    roomName,
  });
}
