const PLATFORM_BASE = "https://platform.higgsfield.ai";

export type HiggsfieldSubmitResult = {
  status: string;
  request_id: string;
  status_url?: string;
  cancel_url?: string;
};

export type HiggsfieldStatusResult = {
  status: string;
  request_id?: string;
  status_url?: string;
  cancel_url?: string;
  images?: Array<{ url: string }>;
  video?: { url: string };
  error?: string;
};

function getAuthHeader(): string {
  const key = process.env.HIGGSFIELD_API_KEY;
  const secret = process.env.HIGGSFIELD_API_SECRET;
  if (!key || !secret) {
    throw new Error("Higgsfield API credentials are not configured");
  }
  return `Key ${key}:${secret}`;
}

export function getDefaultImageModel(): string {
  return process.env.HIGGSFIELD_IMAGE_MODEL ?? "higgsfield-ai/soul/standard";
}

export function getDefaultVideoModel(): string {
  return process.env.HIGGSFIELD_VIDEO_MODEL ?? "higgsfield-ai/dop/standard";
}

export async function submitGeneration(
  modelId: string,
  body: Record<string, unknown>
): Promise<HiggsfieldSubmitResult> {
  const path = modelId.startsWith("/") ? modelId.slice(1) : modelId;
  const url = `${PLATFORM_BASE}/${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Higgsfield submit failed (${res.status}): ${text.slice(0, 500)}`);
  }

  return (await res.json()) as HiggsfieldSubmitResult;
}

export async function getGenerationStatus(
  requestId: string
): Promise<HiggsfieldStatusResult> {
  const url = `${PLATFORM_BASE}/requests/${requestId}/status`;
  const res = await fetch(url, {
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Higgsfield status failed (${res.status}): ${text.slice(0, 500)}`);
  }

  return (await res.json()) as HiggsfieldStatusResult;
}

export async function fetchMediaUrl(url: string): Promise<{ body: ArrayBuffer; contentType: string }> {
  const res = await fetch(url, {
    headers: { Accept: "image/*,video/*,*/*" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch media (${res.status})`);
  }
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const body = await res.arrayBuffer();
  return { body, contentType };
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "nsfw"]);

export async function pollUntilTerminal(
  requestId: string,
  options?: { maxMs?: number; intervalMs?: number }
): Promise<HiggsfieldStatusResult> {
  const maxMs = options?.maxMs ?? 180_000;
  const intervalMs = options?.intervalMs ?? 2500;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const s = await getGenerationStatus(requestId);
    if (TERMINAL_STATUSES.has(s.status)) {
      return s;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Generation timed out");
}
