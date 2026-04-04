import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getImageKitServer } from "@/lib/imagekit/server-client";

/**
 * Returns client upload credentials for ImageKit Upload API v1 (multipart).
 * https://imagekit.io/docs/api-reference/upload-file/upload-file
 */
export async function POST() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
  const urlEndpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
  if (!publicKey || !urlEndpoint) {
    return NextResponse.json(
      { error: "ImageKit is not configured on the server" },
      { status: 500 }
    );
  }

  try {
    const ik = getImageKitServer();
    const { token, expire, signature } = ik.helper.getAuthenticationParameters();
    return NextResponse.json({
      token,
      expire,
      signature,
      publicKey,
      urlEndpoint,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not create upload credentials" },
      { status: 500 }
    );
  }
}
