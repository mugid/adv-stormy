"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Image as ImageIcon, Film } from "lucide-react";

export type CanvasInputMode = "brainstorm" | "image" | "video";

export interface AgentMessage {
  role: "user" | "agent";
  content: string;
  timestamp: number;
}

interface AgentPanelProps {
  mode: CanvasInputMode;
  onModeChange: (mode: CanvasInputMode) => void;
  onBrainstormSubmit: (message: string) => void;
  onImageSubmit: (payload: {
    prompt: string;
    aspectRatio?: string;
    resolution?: string;
  }) => void;
  onVideoSubmit: (payload: {
    imageUrl: string;
    prompt: string;
    duration?: number;
  }) => void;
  messages: AgentMessage[];
  isBrainstormBusy: boolean;
  onBrainstormCancel: () => void;
  isMediaBusy: boolean;
  mediaHint?: string;
}

export function AgentPanel({
  mode,
  onModeChange,
  onBrainstormSubmit,
  onImageSubmit,
  onVideoSubmit,
  messages,
  isBrainstormBusy,
  onBrainstormCancel,
  isMediaBusy,
  mediaHint,
}: AgentPanelProps) {
  const [input, setInput] = useState("");
  const [videoImageUrl, setVideoImageUrl] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("720p");
  const [expanded, setExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const busy = mode === "brainstorm" ? isBrainstormBusy : isMediaBusy;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (mode === "brainstorm") {
      const trimmed = input.trim();
      if (!trimmed) return;
      onBrainstormSubmit(trimmed);
      setInput("");
      setExpanded(true);
      return;
    }

    if (mode === "image") {
      const prompt = input.trim();
      if (!prompt) return;
      onImageSubmit({
        prompt,
        aspectRatio,
        resolution,
      });
      setInput("");
      setExpanded(true);
      return;
    }

    const prompt = input.trim();
    const img = videoImageUrl.trim();
    if (!img || !prompt) return;
    onVideoSubmit({ imageUrl: img, prompt });
    setInput("");
    setExpanded(true);
  }

  const placeholder =
    mode === "brainstorm"
      ? "Ask the AI to brainstorm, organize, or create…"
      : mode === "image"
        ? "Describe the image to generate…"
        : "Describe motion / camera for the video…";

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
          {busy && mode === "brainstorm" && (
            <div className="mr-auto flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
            </div>
          )}
          {busy && mode !== "brainstorm" && (
            <div className="mr-auto rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              Generating… {mediaHint ? `(${mediaHint})` : null}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mx-4 flex flex-col gap-2 rounded-xl border border-border bg-background/95 p-2 shadow-lg backdrop-blur-sm"
      >
        {mode === "video" && (
          <Input
            value={videoImageUrl}
            onChange={(e) => setVideoImageUrl(e.target.value)}
            placeholder="Source image URL (https://…)"
            className="border-border/80 bg-background/80"
            disabled={busy}
          />
        )}
        {mode === "image" && (
          <div className="flex gap-2">
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-xs"
              disabled={busy}
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
            </select>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="h-9 grow rounded-md border border-border bg-background px-2 text-xs"
              disabled={busy}
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5">
            <Button
              type="button"
              variant={mode === "brainstorm" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2"
              onClick={() => onModeChange("brainstorm")}
              title="Brainstorm"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={mode === "image" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2"
              onClick={() => onModeChange("image")}
              title="Image"
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={mode === "video" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2"
              onClick={() => onModeChange("video")}
              title="Video"
            >
              <Film className="h-4 w-4" />
            </Button>
          </div>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
            disabled={busy}
          />
          {mode === "brainstorm" && busy ? (
            <Button type="button" variant="ghost" size="sm" onClick={onBrainstormCancel}>
              Stop
            </Button>
          ) : (
            <Button
              type="submit"
              size="sm"
              disabled={
                busy ||
                (mode === "video"
                  ? !input.trim() || !videoImageUrl.trim()
                  : !input.trim())
              }
            >
              {mode === "brainstorm" ? "Send" : "Generate"}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 text-xs"
          >
            {expanded ? "Hide" : "Show"} chat
          </Button>
        </div>
      </form>
    </div>
  );
}
