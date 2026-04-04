"use client";

const UPLOAD_V1 = "https://upload.imagekit.io/api/v1/files/upload";

type AuthPayload = {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  urlEndpoint: string;
};

export async function fetchImageKitAuth(): Promise<AuthPayload> {
  const res = await fetch("/api/imagekit/auth", { method: "POST" });
  const data = (await res.json()) as AuthPayload & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "ImageKit auth failed");
  }
  return data;
}

/**
 * Upload a board asset from the browser directly to ImageKit.
 * Returns the final delivery URL (same host as urlEndpoint + path from API).
 */
export async function uploadBoardFileViaImageKit(
  boardId: string,
  excalidrawFileId: string,
  file: File
): Promise<{ url: string }> {
  const auth = await fetchImageKitAuth();
  const form = new FormData();
  form.append("file", file);
  form.append(
    "fileName",
    file.name || `${excalidrawFileId}-${Date.now()}.bin`
  );
  form.append("publicKey", auth.publicKey);
  form.append("signature", auth.signature);
  form.append("token", auth.token);
  form.append("expire", String(auth.expire));
  form.append("folder", `/boards/${boardId}`);

  const res = await fetch(UPLOAD_V1, {
    method: "POST",
    body: form,
  });
  const json = (await res.json()) as { url?: string; message?: string };
  if (!res.ok || !json.url) {
    throw new Error(json.message ?? `ImageKit upload failed (${res.status})`);
  }
  return { url: json.url };
}
