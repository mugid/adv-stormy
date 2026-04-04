import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  BinaryFileData,
  BinaryFiles,
  DataURL,
} from "@excalidraw/excalidraw/types";

export type BoardSceneFileEntry = {
  url: string;
  mimeType: string;
};

export type BoardSceneFiles = Record<string, BoardSceneFileEntry>;

export function collectReferencedImageFileIds(
  elements: readonly ExcalidrawElement[]
): string[] {
  const ids = new Set<string>();
  for (const el of elements) {
    if (el.isDeleted) continue;
    if (el.type !== "image") continue;
    const fileId = "fileId" in el && el.fileId ? el.fileId : null;
    if (fileId) ids.add(fileId);
  }
  return [...ids];
}

export function dataURLToUploadFile(
  dataURL: string,
  mimeType: string,
  excalidrawFileId: string
): File {
  const comma = dataURL.indexOf(",");
  if (comma < 0) {
    throw new Error("Invalid data URL");
  }
  const b64 = dataURL.slice(comma + 1);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const ext =
    mimeType === "image/jpeg" || mimeType === "image/jpg"
      ? "jpg"
      : mimeType === "image/webp"
        ? "webp"
        : mimeType === "image/gif"
          ? "gif"
          : mimeType === "image/svg+xml"
            ? "svg"
            : "png";
  return new File([bytes], `${excalidrawFileId}.${ext}`, { type: mimeType });
}

export async function hydrateBoardSceneFiles(
  referencedFileIds: string[],
  sceneFiles: BoardSceneFiles | null | undefined
): Promise<BinaryFiles> {
  const out: Record<string, BinaryFileData> = {};
  const map = sceneFiles ?? {};
  await Promise.all(
    referencedFileIds.map(async (id) => {
      const entry = map[id];
      if (!entry?.url) return;
      try {
        const res = await fetch(entry.url, { mode: "cors" });
        if (!res.ok) return;
        const blob = await res.blob();
        const dataURL: string = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
        const mimeType = (blob.type || entry.mimeType) as BinaryFileData["mimeType"];
        out[id] = {
          id: id as BinaryFileData["id"],
          dataURL: dataURL as DataURL,
          mimeType,
          created: Date.now(),
        };
      } catch {
        /* skip broken assets */
      }
    })
  );
  return out as BinaryFiles;
}
