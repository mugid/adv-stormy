import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  convertToExcalidrawElements,
  mutateElement,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { nanoid } from "nanoid";
import type { AgentAction } from "./types";

export function executeAction(api: ExcalidrawImperativeAPI, action: AgentAction) {
  switch (action.type) {
    case "create_shape":
      return executeCreateShape(api, action);
    case "update_shape":
      return executeUpdateShape(api, action);
    case "delete_shapes":
      return executeDeleteShapes(api, action);
    case "move_shapes":
      return executeMoveShapes(api, action);
    case "create_connection":
      return executeCreateConnection(api, action);
    case "group_shapes":
      return executeGroupShapes(api, action);
    default:
      console.warn("Unknown action type:", (action as AgentAction).type);
  }
}

const COLOR_MAP: Record<string, string> = {
  black: "#1e1e1e",
  blue: "#1971c2",
  green: "#2f9e44",
  grey: "#868e96",
  "light-blue": "#4dabf7",
  "light-green": "#69db7c",
  "light-red": "#ff8787",
  "light-violet": "#b197fc",
  orange: "#e8590c",
  red: "#e03131",
  violet: "#7048e8",
  yellow: "#ffd43b",
};

function resolveColor(color?: string): string {
  if (!color) return "#ffd43b";
  return COLOR_MAP[color] ?? color;
}

function executeCreateShape(
  api: ExcalidrawImperativeAPI,
  action: Extract<AgentAction, { type: "create_shape" }>
) {
  const id = nanoid();
  const { text, color, w, h } = action.props;
  const resolvedColor = resolveColor(color as string | undefined);

  let skeleton: ExcalidrawElementSkeleton;

  if (action.shapeType === "text") {
    skeleton = {
      type: "text",
      id,
      x: action.x,
      y: action.y,
      text: (text as string) || "",
      strokeColor: resolvedColor,
    } as ExcalidrawElementSkeleton;
  } else {
    const shapeType = action.shapeType === "rectangle" ? "rectangle"
      : action.shapeType === "ellipse" ? "ellipse"
      : action.shapeType === "diamond" ? "diamond"
      : "rectangle";

    skeleton = {
      type: shapeType,
      id,
      x: action.x,
      y: action.y,
      width: (w as number) || 200,
      height: (h as number) || 100,
      backgroundColor: resolvedColor,
      fillStyle: "solid",
      strokeColor: "#1e1e1e",
      ...(text ? { label: { text: text as string } } : {}),
    } as ExcalidrawElementSkeleton;
  }

  const newElements = convertToExcalidrawElements([skeleton]);
  const existing = api.getSceneElements();
  api.updateScene({ elements: [...existing, ...newElements] });

  return id;
}

function executeUpdateShape(
  api: ExcalidrawImperativeAPI,
  action: Extract<AgentAction, { type: "update_shape" }>
) {
  const elements = api.getSceneElements();
  const updated = elements.map((el) => {
    if (el.id !== action.shapeId) return el;

    const mutable = { ...el } as Record<string, unknown>;
    if (action.props.color) {
      const resolved = resolveColor(action.props.color as string);
      if (el.type === "text") {
        mutable.strokeColor = resolved;
      } else {
        mutable.backgroundColor = resolved;
      }
    }
    if (action.props.text !== undefined) {
      // For text elements, update text directly; for containers the bound text
      // element would need updating, but we handle text-on-shape via label during creation.
      if (el.type === "text") {
        mutable.text = action.props.text;
        mutable.originalText = action.props.text;
      }
    }
    mutable.version = (el.version ?? 0) + 1;
    mutable.versionNonce = Math.random() * 1e9 | 0;
    return mutable as typeof el;
  });
  api.updateScene({ elements: updated as ExcalidrawElement[] });
}

function executeDeleteShapes(
  api: ExcalidrawImperativeAPI,
  action: Extract<AgentAction, { type: "delete_shapes" }>
) {
  const idsToDelete = new Set(action.shapeIds);
  const elements = api.getSceneElements();
  const remaining = elements.map((el) => {
    if (idsToDelete.has(el.id)) {
      return { ...el, isDeleted: true } as typeof el;
    }
    return el;
  });
  api.updateScene({ elements: remaining as ExcalidrawElement[] });
}

function executeMoveShapes(
  api: ExcalidrawImperativeAPI,
  action: Extract<AgentAction, { type: "move_shapes" }>
) {
  const idsToMove = new Set(action.shapeIds);
  const elements = api.getSceneElements();
  const updated = elements.map((el) => {
    if (!idsToMove.has(el.id)) return el;
    return {
      ...el,
      x: el.x + action.deltaX,
      y: el.y + action.deltaY,
      version: (el.version ?? 0) + 1,
      versionNonce: Math.random() * 1e9 | 0,
    } as typeof el;
  });
  api.updateScene({ elements: updated as ExcalidrawElement[] });
}

/** Match Excalidraw's isBindableElement — bound labels on shapes are not bindable. */
function isAgentBindableEndpoint(el: ExcalidrawElement): boolean {
  if (el.isDeleted) return false;
  const t = el.type;
  if (t === "rectangle" || t === "ellipse" || t === "diamond") return true;
  if (t === "text") {
    return !("containerId" in el && el.containerId != null && el.containerId !== "");
  }
  return t === "image" || t === "iframe" || t === "embeddable" || t === "frame" || t === "magicframe";
}

function attachArrowBinding(
  arrow: ExcalidrawElement,
  target: ExcalidrawElement,
  startOrEnd: "start" | "end"
) {
  if (arrow.type !== "arrow") return;
  const binding = { elementId: target.id, focus: 0.5 as number, gap: 8 as number };
  mutateElement(arrow, {
    [startOrEnd === "start" ? "startBinding" : "endBinding"]: binding,
  }, false);

  const existing = target.boundElements ?? [];
  if (existing.some((b) => b.id === arrow.id)) return;
  mutateElement(target, {
    boundElements: [...existing, { id: arrow.id, type: "arrow" }],
  }, false);
}

function executeCreateConnection(
  api: ExcalidrawImperativeAPI,
  action: Extract<AgentAction, { type: "create_connection" }>
) {
  const scene = [...api.getSceneElements()];
  const from = scene.find((el) => el.id === action.fromShapeId);
  const to = scene.find((el) => el.id === action.toShapeId);
  if (!from || !to) return;

  const fromCx = from.x + (from.width ?? 0) / 2;
  const fromCy = from.y + (from.height ?? 0) / 2;
  const toCx = to.x + (to.width ?? 0) / 2;
  const toCy = to.y + (to.height ?? 0) / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;

  const arrowId = nanoid();
  const arrowSkeleton: ExcalidrawElementSkeleton = {
    type: "arrow",
    id: arrowId,
    x: fromCx,
    y: fromCy,
    strokeColor: "#1e1e1e",
    endArrowhead: "arrow",
    points: [
      [0, 0],
      [dx, dy],
    ],
    ...(action.label ? { label: { text: action.label } } : {}),
  } as ExcalidrawElementSkeleton;

  const newParts = convertToExcalidrawElements([arrowSkeleton], {
    regenerateIds: false,
  });
  const merged = [...scene, ...newParts];

  const canBind =
    isAgentBindableEndpoint(from) && isAgentBindableEndpoint(to);

  if (canBind) {
    const arrow = merged.find((el) => el.id === arrowId);
    const fromEl = merged.find((el) => el.id === from.id);
    const toEl = merged.find((el) => el.id === to.id);

    if (
      arrow &&
      fromEl &&
      toEl &&
      arrow.type === "arrow" &&
      !arrow.isDeleted
    ) {
      attachArrowBinding(arrow, fromEl, "start");
      attachArrowBinding(arrow, toEl, "end");
    }
  }

  api.updateScene({ elements: merged as ExcalidrawElement[] });
  api.refresh();
}

function executeGroupShapes(
  api: ExcalidrawImperativeAPI,
  action: Extract<AgentAction, { type: "group_shapes" }>
) {
  const groupId = nanoid();
  const idsToGroup = new Set(action.shapeIds);
  const elements = api.getSceneElements();
  const updated = elements.map((el) => {
    if (!idsToGroup.has(el.id)) return el;
    return {
      ...el,
      groupIds: [...(el.groupIds ?? []), groupId],
      version: (el.version ?? 0) + 1,
      versionNonce: Math.random() * 1e9 | 0,
    } as typeof el;
  });
  api.updateScene({ elements: updated as ExcalidrawElement[] });
}
