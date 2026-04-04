import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import {
  convertToExcalidrawElements,
  getDataURL,
  MIME_TYPES,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import { nanoid } from "nanoid";

function sceneAnchorForNewElement(api: ExcalidrawImperativeAPI, width: number, height: number) {
  const app = api.getAppState();
  const vw = app.width ?? 800;
  const vh = app.height ?? 600;
  const ox = app.offsetLeft ?? 0;
  const oy = app.offsetTop ?? 0;
  const { x: cx, y: cy } = viewportCoordsToSceneCoords(
    { clientX: ox + vw / 2, clientY: oy + vh / 2 },
    app
  );
  return {
    x: cx - width / 2,
    y: cy - height / 2,
  };
}

function pickImageMime(contentType: string): string {
  const lower = contentType.toLowerCase().split(";")[0]!.trim();
  if (lower === "image/jpeg" || lower === "image/jpg") return MIME_TYPES.jpg;
  if (
    lower === MIME_TYPES.png ||
    lower === MIME_TYPES.gif ||
    lower === MIME_TYPES.webp ||
    lower === MIME_TYPES.svg ||
    lower === MIME_TYPES.bmp ||
    lower === MIME_TYPES.avif
  ) {
    return lower;
  }
  return MIME_TYPES.png;
}

function fitDisplaySize(w: number, h: number, maxEdge: number) {
  if (w <= 0 || h <= 0) return { width: maxEdge, height: maxEdge };
  const s = Math.min(maxEdge / w, maxEdge / h, 1);
  return { width: Math.round(w * s), height: Math.round(h * s) };
}

/**
 * Fetch image via authenticated app proxy and insert as an Excalidraw image element.
 */
export async function placeRemoteImageOnCanvas(
  api: ExcalidrawImperativeAPI,
  remoteHttpsUrl: string
) {
  const proxy = `/api/media/proxy?url=${encodeURIComponent(remoteHttpsUrl)}`;
  const res = await fetch(proxy);
  if (!res.ok) {
    throw new Error(`Proxy fetch failed: ${res.status}`);
  }
  const blob = await res.blob();
  const mimeType = pickImageMime(res.headers.get("content-type") ?? blob.type);

  let naturalW = 320;
  let naturalH = 240;
  try {
    const bmp = await createImageBitmap(blob);
    naturalW = bmp.width;
    naturalH = bmp.height;
    bmp.close();
  } catch {
    /* use defaults */
  }

  const { width, height } = fitDisplaySize(naturalW, naturalH, 420);
  const ext =
    mimeType === MIME_TYPES.jpg
      ? "jpg"
      : mimeType === MIME_TYPES.webp
        ? "webp"
        : mimeType === MIME_TYPES.gif
          ? "gif"
          : "png";
  const file = new File([blob], `generated.${ext}`, { type: mimeType });
  const dataURL = (await getDataURL(file)) as DataURL;
  const fileId = nanoid() as BinaryFileData["id"];

  const { x, y } = sceneAnchorForNewElement(api, width, height);
  const skeleton: ExcalidrawElementSkeleton = {
    type: "image",
    id: nanoid(),
    x,
    y,
    width,
    height,
    fileId,
  };
  const parts = convertToExcalidrawElements([skeleton], {
    regenerateIds: false,
  });
  const existing = api.getSceneElements();
  // Excalidraw's addFiles() runs addNewImagesToImageCache() immediately; that only
  // loads bitmaps for image elements already on the scene. Register the element first,
  // then add the file so the image cache populates on this frame (see paste flow).
  api.updateScene({
    elements: [...existing, ...parts],
  });
  api.addFiles([
    {
      id: fileId,
      dataURL,
      mimeType: mimeType as BinaryFileData["mimeType"],
      created: Date.now(),
    },
  ]);
}
