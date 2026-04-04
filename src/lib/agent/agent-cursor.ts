import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { AgentAction } from "./types";

/** Scene coordinates for overlay cursor (rough center of what the action touches). */
export function scenePointForAgentAction(
  api: ExcalidrawImperativeAPI,
  action: AgentAction
): { x: number; y: number } | null {
  const els = api.getSceneElements();

  switch (action.type) {
    case "create_shape": {
      const w =
        (action.props.w as number | undefined) ??
        (action.shapeType === "text" ? 80 : 200);
      const h =
        (action.props.h as number | undefined) ??
        (action.shapeType === "text" ? 24 : 100);
      return { x: action.x + w / 2, y: action.y + h / 2 };
    }
    case "create_connection": {
      const a = els.find((e) => e.id === action.fromShapeId);
      const b = els.find((e) => e.id === action.toShapeId);
      if (!a || !b) return null;
      return {
        x:
          (a.x +
            (a.width ?? 0) / 2 +
            b.x +
            (b.width ?? 0) / 2) /
          2,
        y:
          (a.y +
            (a.height ?? 0) / 2 +
            b.y +
            (b.height ?? 0) / 2) /
          2,
      };
    }
    case "move_shapes": {
      let cx = 0;
      let cy = 0;
      let n = 0;
      for (const id of action.shapeIds) {
        const el = els.find((e) => e.id === id);
        if (el) {
          cx += el.x + (el.width ?? 0) / 2;
          cy += el.y + (el.height ?? 0) / 2;
          n++;
        }
      }
      if (!n) return null;
      return {
        x: cx / n + action.deltaX,
        y: cy / n + action.deltaY,
      };
    }
    case "update_shape": {
      const el = els.find((e) => e.id === action.shapeId);
      if (!el) return null;
      return {
        x: el.x + (el.width ?? 0) / 2,
        y: el.y + (el.height ?? 0) / 2,
      };
    }
    case "group_shapes": {
      let cx = 0;
      let cy = 0;
      let n = 0;
      for (const id of action.shapeIds) {
        const el = els.find((e) => e.id === id);
        if (el) {
          cx += el.x + (el.width ?? 0) / 2;
          cy += el.y + (el.height ?? 0) / 2;
          n++;
        }
      }
      return n ? { x: cx / n, y: cy / n } : null;
    }
    case "delete_shapes":
      return null;
    default:
      return null;
  }
}

export function defaultAgentCursorScene(
  api: ExcalidrawImperativeAPI
): { x: number; y: number } {
  const els = api.getSceneElements();
  if (!els.length) return { x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of els) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + (el.width ?? 0));
    maxY = Math.max(maxY, el.y + (el.height ?? 0));
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
