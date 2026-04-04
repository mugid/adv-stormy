"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

interface YjsSyncState {
  provider: WebsocketProvider;
  doc: Y.Doc;
  status: "connecting" | "connected" | "disconnected";
}

export function useYjsStore(
  roomId: string,
  api: ExcalidrawImperativeAPI | null,
  userName?: string
) {
  const [state, setState] = useState<YjsSyncState | null>(null);
  const suppressRemoteRef = useRef(false);
  const suppressLocalRef = useRef(false);

  const onChange = useCallback(
    (elements: readonly ExcalidrawElement[]) => {
      if (suppressRemoteRef.current || !state) return;
      const { doc } = state;
      const yElements = doc.getArray<Y.Map<unknown>>("elements");

      suppressLocalRef.current = true;
      doc.transact(() => {
        yElements.delete(0, yElements.length);
        for (const el of elements) {
          const yEl = new Y.Map<unknown>();
          for (const [k, v] of Object.entries(el)) {
            yEl.set(k, v);
          }
          yElements.push([yEl]);
        }
      });
      suppressLocalRef.current = false;
    },
    [state]
  );

  useEffect(() => {
    const doc = new Y.Doc();
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:1234";

    const provider = new WebsocketProvider(wsUrl, roomId, doc, {
      connect: true,
    });

    if (userName) {
      provider.awareness.setLocalStateField("user", {
        name: userName,
        color: generateUserColor(userName),
      });
    }

    const yElements = doc.getArray<Y.Map<unknown>>("elements");

    yElements.observeDeep(() => {
      if (suppressLocalRef.current || !api) return;
      const elements: ExcalidrawElement[] = [];
      yElements.forEach((yEl) => {
        if (yEl) {
          elements.push(yEl.toJSON() as ExcalidrawElement);
        }
      });

      suppressRemoteRef.current = true;
      try {
        api.updateScene({ elements });
      } catch {
        // Sync errors on first init are expected
      }
      suppressRemoteRef.current = false;
    });

    provider.on("status", (event: unknown) => {
      const { status } = event as { status: string };
      setState((prev) =>
        prev
          ? { ...prev, status: status as YjsSyncState["status"] }
          : prev
      );
    });

    setState({ provider, doc, status: "connecting" });

    return () => {
      provider.disconnect();
      provider.destroy();
      doc.destroy();
    };
  }, [roomId, userName, api]);

  return { state, onChange };
}

function generateUserColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}
