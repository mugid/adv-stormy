import Anthropic from "@anthropic-ai/sdk";
import { BRAINSTORM_AGENT_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { AGENT_TOOLS } from "@/lib/agent/tool-schemas";
import type { CanvasContext, AgentAction, AgentStreamEvent } from "@/lib/agent/types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface AgentRequest {
  message: string;
  context: CanvasContext;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

export async function POST(request: Request) {
  const body: AgentRequest = await request.json();
  const { message, context, history } = body;

  const canvasDescription = buildCanvasDescription(context);

  const messages: Anthropic.MessageParam[] = [];

  for (const msg of history.slice(0, -1)) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  const userContent: Anthropic.ContentBlockParam[] = [];

  if (context.screenshot) {
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: context.screenshot,
      },
    });
  }

  userContent.push({
    type: "text",
    text: `## Current Canvas State\n${canvasDescription}\n\n## User Message\n${message}`,
  });

  messages.push({ role: "user", content: userContent });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: AgentStreamEvent) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      }

      try {
        let currentMessages = [...messages];
        let continueLoop = true;

        while (continueLoop) {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: BRAINSTORM_AGENT_SYSTEM_PROMPT,
            tools: AGENT_TOOLS,
            messages: currentMessages,
          });

          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of response.content) {
            if (block.type === "text" && block.text.trim()) {
              send({ type: "message", content: block.text });
            } else if (block.type === "tool_use") {
              const action = toolCallToAction(block.name, block.input as Record<string, unknown>);

              if (block.name === "message") {
                const text = (block.input as { text: string }).text;
                send({ type: "message", content: text });
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: "Message sent to user",
                });
              } else if (action) {
                send({ type: "action", action });
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: `Action ${action.type} executed successfully`,
                });
              } else {
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: "Unknown action",
                  is_error: true,
                });
              }
            }
          }

          if (response.stop_reason === "tool_use" && toolResults.length > 0) {
            currentMessages = [
              ...currentMessages,
              { role: "assistant" as const, content: response.content },
              { role: "user" as const, content: toolResults },
            ];
          } else {
            continueLoop = false;
          }
        }

        send({ type: "done" });
      } catch (err) {
        send({
          type: "error",
          content: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function buildCanvasDescription(context: CanvasContext): string {
  if (context.shapes.length === 0) {
    return "The canvas is currently empty. You have a blank space to work with.";
  }

  const lines = [
    `Canvas has ${context.shapes.length} shape(s).`,
    `Viewport: x=${Math.round(context.viewportBounds.x)}, y=${Math.round(context.viewportBounds.y)}, w=${Math.round(context.viewportBounds.w)}, h=${Math.round(context.viewportBounds.h)}`,
  ];

  if (context.selectedShapeIds.length > 0) {
    lines.push(
      `User has selected: ${context.selectedShapeIds.join(", ")}`
    );
  }

  lines.push("\nShapes on canvas:");
  for (const shape of context.shapes) {
    const parts = [
      `- [${shape.id}] ${shape.type} at (${Math.round(shape.x)}, ${Math.round(shape.y)})`,
      `size ${Math.round(shape.width)}x${Math.round(shape.height)}`,
    ];
    if (shape.text) parts.push(`text: "${shape.text}"`);
    if (shape.color) parts.push(`color: ${shape.color}`);
    lines.push(parts.join(", "));
  }

  return lines.join("\n");
}

function toolCallToAction(
  name: string,
  input: Record<string, unknown>
): AgentAction | null {
  switch (name) {
    case "create_shape": {
      const props: Record<string, unknown> = {};
      if (input.text) props.text = input.text;
      if (input.color) props.color = input.color;
      if (input.w) props.w = input.w;
      if (input.h) props.h = input.h;
      return {
        type: "create_shape",
        shapeType: input.shapeType as "rectangle" | "ellipse" | "diamond" | "text",
        x: input.x as number,
        y: input.y as number,
        props,
      };
    }
    case "create_connection":
      return {
        type: "create_connection",
        fromShapeId: input.fromShapeId as string,
        toShapeId: input.toShapeId as string,
        label: input.label as string | undefined,
      };
    case "update_shape": {
      const updateProps: Record<string, unknown> = {};
      if (input.text) updateProps.text = input.text;
      if (input.color) updateProps.color = input.color;
      return {
        type: "update_shape",
        shapeId: input.shapeId as string,
        props: updateProps,
      };
    }
    case "move_shapes":
      return {
        type: "move_shapes",
        shapeIds: input.shapeIds as string[],
        deltaX: input.deltaX as number,
        deltaY: input.deltaY as number,
      };
    case "delete_shapes":
      return {
        type: "delete_shapes",
        shapeIds: input.shapeIds as string[],
      };
    case "group_shapes":
      return {
        type: "group_shapes",
        shapeIds: input.shapeIds as string[],
      };
    default:
      return null;
  }
}
