"use client";

import { useState, useCallback, useRef } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { AgentMessage } from "@/components/canvas/AgentPanel";
import type { AgentAction, AgentStreamEvent } from "./types";
import { extractCanvasContext } from "./canvas-context";
import { executeAction } from "./action-executor";
import {
  defaultAgentCursorScene,
  scenePointForAgentAction,
} from "./agent-cursor";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export type CanvasAgentPromptOptions = {
  voiceTurnNonce?: string;
  inputSource?: "voice" | "text";
};

export function useCanvasAgent(
  api: ExcalidrawImperativeAPI | null,
  options?: { boardId?: string }
) {
  const boardId = options?.boardId;
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [agentCursorScene, setAgentCursorScene] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<ConversationMessage[]>([]);

  const prompt = useCallback(
    async (
      userMessage: string,
      promptOpts?: CanvasAgentPromptOptions
    ) => {
      if (!api || isThinking) return;

      setMessages((prev) => [
        ...prev,
        { role: "user", content: userMessage, timestamp: Date.now() },
      ]);

      historyRef.current.push({ role: "user", content: userMessage });

      setIsThinking(true);
      setAgentCursorScene(defaultAgentCursorScene(api));
      const controller = new AbortController();
      abortRef.current = controller;

      const inputSource = promptOpts?.voiceTurnNonce
        ? ("voice" as const)
        : (promptOpts?.inputSource ?? "text");

      try {
        const context = await extractCanvasContext(api);

        const response = await fetch("/api/ai/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMessage,
            context,
            history: historyRef.current.slice(-20),
            ...(boardId
              ? {
                  boardId,
                  inputSource,
                  ...(promptOpts?.voiceTurnNonce
                    ? { voiceTurnNonce: promptOpts.voiceTurnNonce }
                    : {}),
                }
              : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let detail = `${response.status}`;
          try {
            const errBody = (await response.json()) as { error?: string };
            if (errBody?.error) detail = errBody.error;
          } catch {
            /* ignore */
          }
          throw new Error(
            response.status === 409
              ? detail
              : `Agent request failed: ${detail}`
          );
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";
        let assistantMessage = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event: AgentStreamEvent = JSON.parse(data);
              handleEvent(api, event, setMessages, setAgentCursorScene, setGeneratedVideoUrl);

              if (event.type === "message" && event.content) {
                assistantMessage += event.content + " ";
              }
              if (event.type === "action" && event.action) {
                const actionDesc = describeAction(event.action);
                if (actionDesc) assistantMessage += actionDesc + " ";
              }
            } catch {
              // Skip malformed events
            }
          }
        }

        if (assistantMessage.trim()) {
          historyRef.current.push({
            role: "assistant",
            content: assistantMessage.trim(),
          });
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) => [
            ...prev,
            {
              role: "agent",
              content: "Something went wrong. Please try again.",
              timestamp: Date.now(),
            },
          ]);
        }
      } finally {
        setIsThinking(false);
        setAgentCursorScene(null);
        abortRef.current = null;
      }
    },
    [api, isThinking, boardId]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsThinking(false);
    setAgentCursorScene(null);
  }, []);

  const clearGeneratedVideo = useCallback(() => setGeneratedVideoUrl(null), []);

  return {
    messages,
    isThinking,
    prompt,
    cancel,
    agentCursorScene,
    generatedVideoUrl,
    clearGeneratedVideo,
  };
}

function handleEvent(
  api: ExcalidrawImperativeAPI,
  event: AgentStreamEvent,
  setMessages: React.Dispatch<React.SetStateAction<AgentMessage[]>>,
  setAgentCursorScene: React.Dispatch<
    React.SetStateAction<{ x: number; y: number } | null>
  >,
  setGeneratedVideoUrl: React.Dispatch<React.SetStateAction<string | null>>
) {
  switch (event.type) {
    case "message":
      if (event.content) {
        setMessages((prev) => [
          ...prev,
          { role: "agent", content: event.content!, timestamp: Date.now() },
        ]);
      }
      break;
    case "action":
      if (event.action) {
        if (event.action.type === "show_generated_video") {
          setGeneratedVideoUrl(event.action.videoUrl);
        }
        executeAction(api, event.action);
        const p = scenePointForAgentAction(api, event.action);
        if (p) setAgentCursorScene(p);
      }
      break;
    case "error":
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          content: event.content ?? "An error occurred",
          timestamp: Date.now(),
        },
      ]);
      break;
  }
}

function describeAction(action: AgentAction): string | null {
  switch (action.type) {
    case "create_shape":
      return `[Created ${action.shapeType}]`;
    case "create_connection":
      return `[Connected shapes]`;
    case "move_shapes":
      return `[Rearranged shapes]`;
    case "delete_shapes":
      return `[Removed shapes]`;
    case "group_shapes":
      return `[Grouped shapes]`;
    case "update_shape":
      return `[Updated shape]`;
    case "place_generated_image":
      return `[Placed generated image]`;
    case "show_generated_video":
      return `[Video ready]`;
    default:
      return null;
  }
}
