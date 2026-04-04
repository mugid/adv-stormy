"use client";

import { useCallback, useState } from "react";
import { Tldraw, Editor } from "tldraw";
import "tldraw/tldraw.css";
import { AgentPanel } from "./AgentPanel";
import { AgentCursor } from "./AgentCursor";
import { useCanvasAgent } from "@/lib/agent/use-canvas-agent";

interface BoardProps {
  boardId: string;
}

export function Board({ boardId }: BoardProps) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const agent = useCanvasAgent(editor);

  const handleMount = useCallback((editorInstance: Editor) => {
    setEditor(editorInstance);
  }, []);

  return (
    <div className="relative h-full w-full">
      <Tldraw onMount={handleMount} />
      {editor && (
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
