"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Excalidraw,
  sceneCoordsToViewportCoords,
  restore,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";
import { AgentPanel } from "./AgentPanel";
import { AgentCursor } from "./AgentCursor";
import { useCanvasAgent } from "@/lib/agent/use-canvas-agent";

interface BoardProps {
  boardId: string;
}

const SAVE_DEBOUNCE_MS = 650;

export function Board({ boardId }: BoardProps) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [boot, setBoot] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; initialData: ReturnType<typeof restore> }
  >({ status: "loading" });
  const persistOkRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const agent = useCanvasAgent(api);

  useEffect(() => {
    let cancelled = false;
    persistOkRef.current = false;
    setBoot({ status: "loading" });

    async function load() {
      const res = await fetch(`/api/boards/${boardId}`);
      if (cancelled) return;
      if (res.status === 401) {
        window.location.href = "/";
        return;
      }
      if (!res.ok) {
        setBoot({
          status: "error",
          message: res.status === 404 ? "Board not found." : "Could not load board.",
        });
        return;
      }

      const data: { sceneJson?: string | null } = await res.json();
      if (cancelled) return;

      let initial: ReturnType<typeof restore>;
      if (data.sceneJson && data.sceneJson.length > 0) {
        try {
          const parsed = JSON.parse(data.sceneJson) as ImportedDataState;
          initial = restore(
            {
              elements: parsed.elements ?? [],
              appState: parsed.appState,
              files: parsed.files,
            },
            null,
            null,
          );
        } catch {
          initial = restore(null, null, null);
        }
      } else {
        initial = restore(null, null, null);
      }

      setBoot({ status: "ready", initialData: initial });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  useEffect(() => {
    if (boot.status !== "ready" || !api) return;
    persistOkRef.current = false;
    const t = window.setTimeout(() => {
      persistOkRef.current = true;
    }, 300);
    return () => clearTimeout(t);
  }, [api, boot]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const scheduleSave = useCallback(
    (
      elements: Parameters<typeof serializeAsJSON>[0],
      appState: Parameters<typeof serializeAsJSON>[1],
      files: Parameters<typeof serializeAsJSON>[2],
    ) => {
      if (!persistOkRef.current) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        const sceneJson = serializeAsJSON(elements, appState, files, "database");
        void fetch(`/api/boards/${boardId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sceneJson }),
        }).catch((err) => console.error("Failed to save board", err));
      }, SAVE_DEBOUNCE_MS);
    },
    [boardId],
  );

  const onExcalidrawChange = useCallback(
    (
      elements: Parameters<typeof serializeAsJSON>[0],
      appState: Parameters<typeof serializeAsJSON>[1],
      files: Parameters<typeof serializeAsJSON>[2],
    ) => {
      scheduleSave(elements, appState, files);
    },
    [scheduleSave],
  );

  const [cursorVp, setCursorVp] = useState({ x: 0, y: 0 });
  const [wobble, setWobble] = useState({ x: 0, y: 0 });

  const updateCursorVp = useCallback(() => {
    if (!api || !agent.agentCursorScene) return;
    const app = api.getAppState();
    const v = sceneCoordsToViewportCoords(
      {
        sceneX: agent.agentCursorScene.x,
        sceneY: agent.agentCursorScene.y,
      },
      {
        zoom: app.zoom,
        offsetLeft: app.offsetLeft,
        offsetTop: app.offsetTop,
        scrollX: app.scrollX,
        scrollY: app.scrollY,
      }
    );
    setCursorVp(v);
  }, [api, agent.agentCursorScene]);

  useEffect(() => {
    updateCursorVp();
  }, [updateCursorVp]);

  useEffect(() => {
    if (!api) return;
    const unsub = api.onScrollChange(() => updateCursorVp());
    return unsub;
  }, [api, updateCursorVp]);

  useEffect(() => {
    if (!agent.isThinking) {
      setWobble({ x: 0, y: 0 });
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      setWobble({
        x: Math.sin(t * 2.4) * 10,
        y: Math.cos(t * 1.9) * 8,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [agent.isThinking]);

  if (boot.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        Loading board…
      </div>
    );
  }

  if (boot.status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-background px-4 text-center text-sm text-muted-foreground">
        <p>{boot.message}</p>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 w-full bg-background">
      <div className="absolute inset-0 z-0 [&_.excalidraw]:h-full [&_.excalidraw]:max-h-none">
        <Excalidraw
          key={boardId}
          excalidrawAPI={(a) => setApi(a)}
          initialData={boot.initialData}
          onChange={onExcalidrawChange}
        />
      </div>
      {api && (
        <>
          <AgentCursor
            x={cursorVp.x + wobble.x}
            y={cursorVp.y + wobble.y}
            visible={agent.isThinking && agent.agentCursorScene != null}
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
