import type Anthropic from "@anthropic-ai/sdk";

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "create_shape",
    description:
      "Create a new shape on the canvas. Use 'rectangle' for sticky notes (primary brainstorming tool — filled rectangle with text label), 'text' for standalone text labels, 'ellipse' for oval shapes, 'diamond' for decision nodes. Use create_connection for arrows between shapes.",
    input_schema: {
      type: "object" as const,
      properties: {
        shapeType: {
          type: "string",
          enum: ["rectangle", "text", "ellipse", "diamond"],
          description: "Type of shape to create",
        },
        x: {
          type: "number",
          description: "X position on canvas",
        },
        y: {
          type: "number",
          description: "Y position on canvas",
        },
        text: {
          type: "string",
          description: "Text content of the shape",
        },
        color: {
          type: "string",
          enum: [
            "black",
            "blue",
            "green",
            "grey",
            "light-blue",
            "light-green",
            "light-red",
            "light-violet",
            "orange",
            "red",
            "violet",
            "yellow",
          ],
          description:
            "Color of the shape. Use yellow for ideas, blue for questions, green for decisions, red for concerns, violet for categories",
        },
        w: {
          type: "number",
          description: "Width of the shape",
        },
        h: {
          type: "number",
          description: "Height of the shape",
        },
      },
      required: ["shapeType", "x", "y"],
    },
  },
  {
    name: "create_connection",
    description:
      "Draw an arrow connecting two shapes to show a relationship between ideas",
    input_schema: {
      type: "object" as const,
      properties: {
        fromShapeId: {
          type: "string",
          description: "ID of the shape where the arrow starts",
        },
        toShapeId: {
          type: "string",
          description: "ID of the shape where the arrow ends",
        },
        label: {
          type: "string",
          description: "Optional label describing the relationship",
        },
      },
      required: ["fromShapeId", "toShapeId"],
    },
  },
  {
    name: "update_shape",
    description: "Update properties of an existing shape on the canvas",
    input_schema: {
      type: "object" as const,
      properties: {
        shapeId: {
          type: "string",
          description: "ID of the shape to update",
        },
        text: {
          type: "string",
          description: "New text content",
        },
        color: {
          type: "string",
          enum: [
            "black",
            "blue",
            "green",
            "grey",
            "light-blue",
            "light-green",
            "light-red",
            "light-violet",
            "orange",
            "red",
            "violet",
            "yellow",
          ],
          description: "New color",
        },
      },
      required: ["shapeId"],
    },
  },
  {
    name: "move_shapes",
    description:
      "Move one or more shapes by a relative offset. Use to organize and rearrange ideas spatially.",
    input_schema: {
      type: "object" as const,
      properties: {
        shapeIds: {
          type: "array",
          items: { type: "string" },
          description: "IDs of shapes to move",
        },
        deltaX: {
          type: "number",
          description: "Horizontal offset (positive = right)",
        },
        deltaY: {
          type: "number",
          description: "Vertical offset (positive = down)",
        },
      },
      required: ["shapeIds", "deltaX", "deltaY"],
    },
  },
  {
    name: "delete_shapes",
    description: "Remove shapes from the canvas",
    input_schema: {
      type: "object" as const,
      properties: {
        shapeIds: {
          type: "array",
          items: { type: "string" },
          description: "IDs of shapes to delete",
        },
      },
      required: ["shapeIds"],
    },
  },
  {
    name: "group_shapes",
    description:
      "Group multiple shapes together so they move as a unit. Useful after organizing a cluster of related ideas.",
    input_schema: {
      type: "object" as const,
      properties: {
        shapeIds: {
          type: "array",
          items: { type: "string" },
          description: "IDs of shapes to group",
        },
      },
      required: ["shapeIds"],
    },
  },
  {
    name: "generate_image",
    description:
      "Generate an image from a text prompt using Higgsfield and place it on the canvas. Use when the user asks for a picture, illustration, or visual.",
    input_schema: {
      type: "object" as const,
      properties: {
        prompt: {
          type: "string",
          description: "Detailed description of the image to generate",
        },
        aspect_ratio: {
          type: "string",
          description: 'Aspect ratio e.g. "16:9", "9:16", "1:1"',
        },
        resolution: {
          type: "string",
          description: 'Resolution e.g. "720p", "1080p"',
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "generate_video",
    description:
      "Generate a short video from a source image URL and motion prompt (Higgsfield image-to-video). Requires a public https image URL.",
    input_schema: {
      type: "object" as const,
      properties: {
        image_url: {
          type: "string",
          description: "Public https URL of the source image",
        },
        prompt: {
          type: "string",
          description: "Describe motion, camera, and what should happen",
        },
        duration: {
          type: "number",
          description: "Duration in seconds if the model supports it",
        },
      },
      required: ["image_url", "prompt"],
    },
  },
  {
    name: "message",
    description:
      "Send a text message to the user explaining what you're doing or asking for clarification. Use sparingly — your canvas actions are the primary communication.",
    input_schema: {
      type: "object" as const,
      properties: {
        text: {
          type: "string",
          description: "Message to send to the user",
        },
      },
      required: ["text"],
    },
  },
];
