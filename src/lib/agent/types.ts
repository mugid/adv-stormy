export interface CanvasContext {
  shapes: ShapeInfo[];
  viewportBounds: { x: number; y: number; w: number; h: number };
  selectedShapeIds: string[];
  screenshot?: string;
}

export interface ShapeInfo {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  color?: string;
  props: Record<string, unknown>;
}

export type AgentAction =
  | CreateShapeAction
  | UpdateShapeAction
  | DeleteShapesAction
  | MoveShapesAction
  | CreateConnectionAction
  | GroupShapesAction
  | PlaceGeneratedImageAction
  | ShowGeneratedVideoAction;

export interface CreateShapeAction {
  type: "create_shape";
  shapeType: "rectangle" | "ellipse" | "diamond" | "text";
  x: number;
  y: number;
  props: Record<string, unknown>;
}

export interface UpdateShapeAction {
  type: "update_shape";
  shapeId: string;
  props: Record<string, unknown>;
}

export interface DeleteShapesAction {
  type: "delete_shapes";
  shapeIds: string[];
}

export interface MoveShapesAction {
  type: "move_shapes";
  shapeIds: string[];
  deltaX: number;
  deltaY: number;
}

export interface CreateConnectionAction {
  type: "create_connection";
  fromShapeId: string;
  toShapeId: string;
  label?: string;
}

export interface GroupShapesAction {
  type: "group_shapes";
  shapeIds: string[];
}

export interface PlaceGeneratedImageAction {
  type: "place_generated_image";
  imageUrl: string;
}

export interface ShowGeneratedVideoAction {
  type: "show_generated_video";
  videoUrl: string;
}

export interface AgentStreamEvent {
  type: "thinking" | "action" | "message" | "done" | "error";
  content?: string;
  action?: AgentAction;
}
