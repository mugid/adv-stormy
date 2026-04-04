import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { exportToBlob } from "@excalidraw/excalidraw";
import type { CanvasContext, ShapeInfo } from "./types";

export async function extractCanvasContext(
  api: ExcalidrawImperativeAPI
): Promise<CanvasContext> {
  const elements = api.getSceneElements();
  const appState = api.getAppState();

  const shapeInfos: ShapeInfo[] = elements.map((el) => {
    const text = getElementText(el);

    return {
      id: el.id,
      type: el.type,
      x: el.x,
      y: el.y,
      width: el.width ?? 0,
      height: el.height ?? 0,
      text: text || undefined,
      color: el.type === "text" ? el.strokeColor : el.backgroundColor,
      props: {
        strokeColor: el.strokeColor,
        backgroundColor: el.backgroundColor,
        fillStyle: el.fillStyle,
        groupIds: el.groupIds,
      },
    };
  });

  const zoom = appState.zoom?.value ?? 1;
  const viewportBounds = {
    x: -(appState.scrollX ?? 0),
    y: -(appState.scrollY ?? 0),
    w: (appState.width ?? 0) / zoom,
    h: (appState.height ?? 0) / zoom,
  };

  const selectedShapeIds = Object.keys(appState.selectedElementIds ?? {}).filter(
    (id) => appState.selectedElementIds[id]
  );

  let screenshot: string | undefined;
  try {
    if (elements.length > 0) {
      const blob = await exportToBlob({
        elements,
        appState: { ...appState, exportBackground: true },
        files: api.getFiles(),
        maxWidthOrHeight: 800,
      });
      const buffer = await blob.arrayBuffer();
      screenshot = btoa(
        new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), "")
      );
    }
  } catch {
    // Screenshot may fail in certain environments
  }

  return {
    shapes: shapeInfos,
    viewportBounds,
    selectedShapeIds,
    screenshot,
  };
}

function getElementText(el: Record<string, unknown>): string | null {
  if (typeof el.text === "string" && el.text) return el.text as string;
  return null;
}
