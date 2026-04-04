import type { Editor } from "tldraw";
import type { CanvasContext, ShapeInfo } from "./types";

export async function extractCanvasContext(
  editor: Editor
): Promise<CanvasContext> {
  const shapes = editor.getCurrentPageShapes();
  const viewportBounds = editor.getViewportPageBounds();
  const selectedIds = editor.getSelectedShapeIds();

  const shapeInfos: ShapeInfo[] = shapes.map((shape) => {
    const bounds = editor.getShapePageBounds(shape);
    const text = getShapeText(shape);

    return {
      id: shape.id,
      type: shape.type,
      x: shape.x,
      y: shape.y,
      width: bounds?.w ?? 0,
      height: bounds?.h ?? 0,
      text: text || undefined,
      color: (shape.props as Record<string, unknown>).color as
        | string
        | undefined,
      props: shape.props as Record<string, unknown>,
    };
  });

  let screenshot: string | undefined;
  try {
    if (shapes.length > 0) {
      const result = await editor.toImage(shapes, { format: "png", scale: 0.5 });
      if (result.blob) {
        const buffer = await result.blob.arrayBuffer();
        screenshot = Buffer.from(buffer).toString("base64");
      }
    }
  } catch {
    // Screenshot may fail in certain environments
  }

  return {
    shapes: shapeInfos,
    viewportBounds: {
      x: viewportBounds.x,
      y: viewportBounds.y,
      w: viewportBounds.w,
      h: viewportBounds.h,
    },
    selectedShapeIds: selectedIds as string[],
    screenshot,
  };
}

function getShapeText(shape: { type: string; props: unknown }): string | null {
  const props = shape.props as Record<string, unknown>;
  if (typeof props.text === "string") return props.text;
  if (typeof props.richText === "object" && props.richText) {
    return extractRichText(props.richText);
  }
  return null;
}

function extractRichText(richText: unknown): string {
  if (!richText || typeof richText !== "object") return "";
  const rt = richText as { content?: Array<{ content?: Array<{ text?: string }> }> };
  if (!rt.content) return "";
  return rt.content
    .flatMap((block) => block.content?.map((inline) => inline.text ?? "") ?? [])
    .join("");
}
