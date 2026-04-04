import type { Editor, TLShapeId } from "tldraw";
import { createShapeId } from "tldraw";
import type { AgentAction } from "./types";

function asShapeId(id: string): TLShapeId {
  return id as TLShapeId;
}

export function executeAction(editor: Editor, action: AgentAction) {
  switch (action.type) {
    case "create_shape":
      return executeCreateShape(editor, action);
    case "update_shape":
      return executeUpdateShape(editor, action);
    case "delete_shapes":
      return executeDeleteShapes(editor, action);
    case "move_shapes":
      return executeMoveShapes(editor, action);
    case "create_connection":
      return executeCreateConnection(editor, action);
    case "group_shapes":
      return executeGroupShapes(editor, action);
    default:
      console.warn("Unknown action type:", (action as AgentAction).type);
  }
}

function executeCreateShape(
  editor: Editor,
  action: Extract<AgentAction, { type: "create_shape" }>
) {
  const id = createShapeId();
  const { text, color, w, h, geo } = action.props;

  // Build props dynamically — shape prop types are strict literal unions,
  // but AI-provided values are validated by the tool schema upstream
  const props: Record<string, unknown> = {};
  if (color) props.color = color;
  if (text) props.richText = toSimpleRichText(text as string);
  if (w) props.w = w;
  if (h) props.h = h;
  if (geo) props.geo = geo;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor.createShape({
    id,
    type: action.shapeType,
    x: action.x,
    y: action.y,
    props,
  } as any);

  return id;
}

function executeUpdateShape(
  editor: Editor,
  action: Extract<AgentAction, { type: "update_shape" }>
) {
  const existing = editor.getShape(asShapeId(action.shapeId));
  if (!existing) return;

  const props: Record<string, unknown> = {};
  if (action.props.text) {
    props.richText = toSimpleRichText(action.props.text as string);
  }
  if (action.props.color) {
    props.color = action.props.color;
  }

  editor.updateShape({
    id: existing.id,
    type: existing.type,
    props,
  });
}

function executeDeleteShapes(
  editor: Editor,
  action: Extract<AgentAction, { type: "delete_shapes" }>
) {
  const ids = action.shapeIds
    .map((id) => editor.getShape(asShapeId(id)))
    .filter(Boolean)
    .map((s) => s!.id);
  if (ids.length > 0) {
    editor.deleteShapes(ids);
  }
}

function executeMoveShapes(
  editor: Editor,
  action: Extract<AgentAction, { type: "move_shapes" }>
) {
  for (const shapeId of action.shapeIds) {
    const shape = editor.getShape(asShapeId(shapeId));
    if (!shape) continue;
    editor.updateShape({
      id: shape.id,
      type: shape.type,
      x: shape.x + action.deltaX,
      y: shape.y + action.deltaY,
    });
  }
}

function executeCreateConnection(
  editor: Editor,
  action: Extract<AgentAction, { type: "create_connection" }>
) {
  const from = editor.getShape(asShapeId(action.fromShapeId));
  const to = editor.getShape(asShapeId(action.toShapeId));
  if (!from || !to) return;

  const fromBounds = editor.getShapePageBounds(from);
  const toBounds = editor.getShapePageBounds(to);
  if (!fromBounds || !toBounds) return;

  const arrowId = createShapeId();
  editor.createShape({
    id: arrowId,
    type: "arrow",
    x: fromBounds.midX,
    y: fromBounds.midY,
    props: {
      start: { x: 0, y: 0 },
      end: {
        x: toBounds.midX - fromBounds.midX,
        y: toBounds.midY - fromBounds.midY,
      },
      ...(action.label
        ? { richText: toSimpleRichText(action.label) }
        : {}),
    },
  });

  editor.createBindings([
    {
      fromId: arrowId,
      toId: from.id,
      type: "arrow",
      props: {
        terminal: "start" as const,
        isExact: false,
        isPrecise: false,
        normalizedAnchor: { x: 0.5, y: 0.5 },
      },
    },
    {
      fromId: arrowId,
      toId: to.id,
      type: "arrow",
      props: {
        terminal: "end" as const,
        isExact: false,
        isPrecise: false,
        normalizedAnchor: { x: 0.5, y: 0.5 },
      },
    },
  ]);
}

function executeGroupShapes(
  editor: Editor,
  action: Extract<AgentAction, { type: "group_shapes" }>
) {
  const ids = action.shapeIds
    .map((id) => editor.getShape(asShapeId(id)))
    .filter(Boolean)
    .map((s) => s!.id);
  if (ids.length > 1) {
    editor.select(...ids);
    editor.groupShapes(editor.getSelectedShapeIds());
  }
}

function toSimpleRichText(text: string) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}
