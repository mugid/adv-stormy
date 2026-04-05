/**
 * Pure Yjs ↔ Excalidraw scene mapping (no React).
 * Used by useYjsStore for realtime collaboration.
 */

import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import * as Y from "yjs";

/** Root keys on the shared Y.Doc */
export const YDOC_ELEMENTS = "elements";
export const YDOC_SCENE_FILES = "sceneFiles";

export type ApplyingRemoteFlag = { current: boolean };

export function yMapFromElement(el: ExcalidrawElement): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(el)) m.set(k, v);
  return m;
}

export function replaceYElementsFromExcalidraw(
  doc: Y.Doc,
  yElements: Y.Array<Y.Map<unknown>>,
  elements: readonly ExcalidrawElement[],
) {
  doc.transact(() => {
    yElements.delete(0, yElements.length);
    for (const el of elements) yElements.push([yMapFromElement(el)]);
  });
}

/** Append-only seed when the array is still empty (e.g. first load). */
export function appendYElementsFromExcalidraw(
  doc: Y.Doc,
  yElements: Y.Array<Y.Map<unknown>>,
  elements: readonly ExcalidrawElement[],
) {
  if (yElements.length > 0 || elements.length === 0) return;
  doc.transact(() => {
    for (const el of elements) yElements.push([yMapFromElement(el)]);
  });
}

export function excalidrawElementsFromYArray(
  yElements: Y.Array<Y.Map<unknown>>,
): ExcalidrawElement[] {
  const out: ExcalidrawElement[] = [];
  yElements.forEach((yEl) => {
    if (yEl) out.push(yEl.toJSON() as ExcalidrawElement);
  });
  return out;
}

/** Writes Yjs elements into Excalidraw; toggles guard so onChange does not re-emit into Y. */
export function pushYElementsToExcalidraw(
  yElements: Y.Array<Y.Map<unknown>>,
  api: ExcalidrawImperativeAPI,
  applyingRemote: ApplyingRemoteFlag,
) {
  if (yElements.length === 0) return;
  applyingRemote.current = true;
  try {
    api.updateScene({
      elements: excalidrawElementsFromYArray(yElements),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  } catch {
    /* mount race */
  }
  applyingRemote.current = false;
}
