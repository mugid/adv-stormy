"use client";

import { useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { AgentPanel } from "./AgentPanel";
import { AgentCursor } from "./AgentCursor";
import { useCanvasAgent } from "@/lib/agent/use-canvas-agent";

interface BoardProps {
  boardId: string;
}

export function Board({ boardId }: BoardProps) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const agent = useCanvasAgent(api);

  return (
    <div className="relative h-full min-h-0 w-full bg-background">
      <div className="absolute inset-0 z-0 [&_.excalidraw]:h-full [&_.excalidraw]:max-h-none">
        <Excalidraw excalidrawAPI={(a) => setApi(a)} />
      </div>
      {api && (
        <>
          <AgentCursor
            x={0}
            y={0}
            visible={agent.isThinking}
            label="Stormy AI"
          />
          <AgentPanel
            onSubmit={agent.prompt}
            messages={agent.messages}
            isThinking={agent.isThinking}
            onCancel={agent.cancel}
          />
        </>
      )}
    </div>
  );
}
