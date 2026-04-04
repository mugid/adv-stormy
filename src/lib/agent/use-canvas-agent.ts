"use client";

import { useState, useCallback, useRef } from "react";
import type { Editor } from "tldraw";
import type { AgentMessage } from "@/components/canvas/AgentPanel";
import type { AgentAction, AgentStreamEvent } from "./types";
import { extractCanvasContext } from "./canvas-context";
import { executeAction } from "./action-executor";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export function useCanvasAgent(editor: Editor | null) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<ConversationMessage[]>([]);

  const prompt = useCallback(
    async (userMessage: string) => {
      if (!editor || isThinking) return;

      setMessages((prev) => [
        ...prev,
        { role: "user", content: userMessage, timestamp: Date.now() },
      ]);

      historyRef.current.push({ role: "user", content: userMessage });

      setIsThinking(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const context = await extractCanvasContext(editor);

        const response = await fetch("/api/ai/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMessage,
            context,
            history: historyRef.current.slice(-20),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Agent request failed: ${response.status}`);
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
              handleEvent(editor, event, setMessages);

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
        abortRef.current = null;
      }
    },
    [editor, isThinking]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsThinking(false);
  }, []);

  return { messages, isThinking, prompt, cancel };
}

function handleEvent(
  editor: Editor,
  event: AgentStreamEvent,
  setMessages: React.Dispatch<React.SetStateAction<AgentMessage[]>>
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
        executeAction(editor, event.action);
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
    default:
      return null;
  }
}
