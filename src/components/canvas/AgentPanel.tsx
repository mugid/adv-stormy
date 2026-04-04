"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface AgentMessage {
  role: "user" | "agent";
  content: string;
  timestamp: number;
}

interface AgentPanelProps {
  onSubmit: (message: string) => void;
  messages: AgentMessage[];
  isThinking: boolean;
  onCancel: () => void;
}

export function AgentPanel({
  onSubmit,
  messages,
  isThinking,
  onCancel,
}: AgentPanelProps) {
  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;
    onSubmit(trimmed);
    setInput("");
    setExpanded(true);
  }

  return (
    <div className="absolute bottom-20 left-1/2 z-50 flex w-full max-w-lg -translate-x-1/2 flex-col gap-2">
      {expanded && messages.length > 0 && (
        <div className="mx-4 flex max-h-64 flex-col gap-1.5 overflow-y-auto rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "mr-auto bg-muted text-muted-foreground"
              }`}
            >
              {msg.content}
            </div>
          ))}
          {isThinking && (
            <div className="mr-auto flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mx-4 flex items-center gap-2 rounded-xl border border-border bg-background/95 p-2 shadow-lg backdrop-blur-sm"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the AI to brainstorm, organize, or create..."
          className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
          disabled={isThinking}
        />
        {isThinking ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
          >
            Stop
          </Button>
        ) : (
          <Button type="submit" size="sm" disabled={!input.trim()}>
            Send
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="text-xs"
        >
          {expanded ? "Hide" : "Show"} chat
        </Button>
      </form>
    </div>
  );
}
