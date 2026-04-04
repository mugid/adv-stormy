"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type {
  Collaborator,
  ExcalidrawImperativeAPI,
  SocketId,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { YjsSceneFileEntry } from "@/lib/excalidraw/board-scene-files";

export type { YjsSceneFileEntry };

export interface YjsSyncState {
  provider: WebsocketProvider;
  doc: Y.Doc;
  status: "connecting" | "connected" | "disconnected";
}

type UseYjsOptions = {
  userName?: string;
  /** When false, no WebSocket connection (use until board load confirms access). */
  enabled?: boolean;
};

function hslToCollaboratorColors(hsl: string): Collaborator["color"] {
  return {
    stroke: hsl,
    background: hsl,
  };
}

function awarenessToCollaborators(
  awareness: WebsocketProvider["awareness"]
): Map<SocketId, Collaborator> {
  const map = new Map<SocketId, Collaborator>();
  const states = awareness.getStates() as Map<
    number,
    {
      user?: { name?: string; color?: string };
      pointer?: { x: number; y: number; tool?: "pointer" | "laser" };
    }
  >;
  states.forEach((payload, clientId) => {
    if (clientId === awareness.clientID) return;
    const name = payload.user?.name ?? "Collaborator";
    const hsl = payload.user?.color ?? "hsl(220, 70%, 50%)";
    const hasPtr =
      payload.pointer &&
      Number.isFinite(payload.pointer.x) &&
      Number.isFinite(payload.pointer.y);
    const c = {
      username: name,
      color: hslToCollaboratorColors(hsl),
      socketId: String(clientId) as SocketId,
      ...(hasPtr
        ? {
            pointer: {
              x: payload.pointer!.x,
              y: payload.pointer!.y,
              tool: (payload.pointer!.tool ?? "pointer") as "pointer" | "laser",
            },
          }
        : {}),
    } satisfies Collaborator;
    map.set(String(clientId) as SocketId, c);
  });
  return map;
}

async function fetchUrlToBinaryFile(
  fileId: string,
  url: string,
  mimeType: string
) {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const blob = await res.blob();
  const dataURL: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  return {
    id: fileId as import("@excalidraw/excalidraw/types").BinaryFileData["id"],
    dataURL: dataURL as import("@excalidraw/excalidraw/types").DataURL,
    mimeType: (blob.type || mimeType) as import("@excalidraw/excalidraw/types").BinaryFileData["mimeType"],
    created: Date.now(),
  };
}

type BinaryFilePayload = Awaited<ReturnType<typeof fetchUrlToBinaryFile>>;

export function useYjsStore(
  roomId: string,
  api: ExcalidrawImperativeAPI | null,
  options?: UseYjsOptions
) {
  const userName = options?.userName;
  const enabled = options?.enabled ?? true;

  const [state, setState] = useState<YjsSyncState | null>(null);
  const suppressRemoteRef = useRef(false);
  const suppressLocalRef = useRef(false);
  const applyingSceneFilesRef = useRef(false);

  const pushCollaborators = useCallback(
    (provider: WebsocketProvider | null, excalidrawApi: ExcalidrawImperativeAPI) => {
      if (!provider) return;
      const collaborators = awarenessToCollaborators(provider.awareness);
      suppressRemoteRef.current = true;
      try {
        excalidrawApi.updateScene({
          appState: { collaborators },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      } catch {
        /* ignore */
      }
      suppressRemoteRef.current = false;
    },
    []
  );

  const applySceneFilesFromY = useCallback(
    async (yFiles: Y.Map<unknown>, excalidrawApi: ExcalidrawImperativeAPI) => {
      applyingSceneFilesRef.current = true;
      const existing = excalidrawApi.getFiles();
      const batch: Promise<BinaryFilePayload | null>[] = [];
      yFiles.forEach((val, fileId) => {
        const e = val as YjsSceneFileEntry | undefined;
        if (!e?.url || existing[fileId]) return;
        batch.push(
          fetchUrlToBinaryFile(fileId, e.url, e.mimeType).catch(() => null)
        );
      });
      const resolved = (await Promise.all(batch)).filter(
        (x): x is BinaryFilePayload => x != null
      );
      if (resolved.length) {
        suppressRemoteRef.current = true;
        try {
          excalidrawApi.addFiles(resolved);
        } catch {
          /* ignore */
        }
        suppressRemoteRef.current = false;
      }
      applyingSceneFilesRef.current = false;
    },
    []
  );

  const onElementsChange = useCallback(
    (elements: readonly ExcalidrawElement[]) => {
      if (suppressRemoteRef.current || !state) return;
      const { doc } = state;
      const yEls = doc.getArray<Y.Map<unknown>>("elements");

      suppressLocalRef.current = true;
      doc.transact(() => {
        yEls.delete(0, yEls.length);
        for (const el of elements) {
          const yEl = new Y.Map<unknown>();
          for (const [k, v] of Object.entries(el)) {
            yEl.set(k, v);
          }
          yEls.push([yEl]);
        }
      });
      suppressLocalRef.current = false;
    },
    [state]
  );

  const onSceneFilesChange = useCallback(
    (patch: Record<string, YjsSceneFileEntry>) => {
      if (suppressRemoteRef.current || !state || applyingSceneFilesRef.current)
        return;
      const yFiles = state.doc.getMap<unknown>("sceneFiles");
      suppressLocalRef.current = true;
      state.doc.transact(() => {
        for (const [id, entry] of Object.entries(patch)) {
          if (!entry?.url) continue;
          const cur = yFiles.get(id) as YjsSceneFileEntry | undefined;
          if (cur?.url === entry.url && cur?.mimeType === entry.mimeType)
            continue;
          yFiles.set(id, { url: entry.url, mimeType: entry.mimeType });
        }
      });
      suppressLocalRef.current = false;
    },
    [state]
  );

  const handlePointerUpdate = useCallback(
    (payload: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "down" | "up";
    }) => {
      if (!state?.provider || suppressRemoteRef.current) return;
      state.provider.awareness.setLocalStateField("pointer", {
        x: payload.pointer.x,
        y: payload.pointer.y,
        tool: payload.pointer.tool,
        button: payload.button,
      });
    },
    [state]
  );

  useEffect(() => {
    if (!enabled || !api) {
      // Collab disabled: clear WS state when navigating away or before canvas is ready.
      queueMicrotask(() => setState(null));
      return;
    }

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
    const ySceneFiles = doc.getMap<unknown>("sceneFiles");

    const flushElements = () => {
      if (suppressLocalRef.current || !api) return;
      if (yElements.length === 0) return;
      const elements: ExcalidrawElement[] = [];
      yElements.forEach((yEl) => {
        if (yEl) elements.push(yEl.toJSON() as ExcalidrawElement);
      });
      suppressRemoteRef.current = true;
      try {
        api.updateScene({
          elements,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      } catch {
        /* sync races on init */
      }
      suppressRemoteRef.current = false;
    };

    yElements.observeDeep(flushElements);

    const onYFiles = () => {
      void applySceneFilesFromY(ySceneFiles, api);
    };
    ySceneFiles.observe(onYFiles);
    void applySceneFilesFromY(ySceneFiles, api);

    const onAwareness = () => pushCollaborators(provider, api);
    provider.awareness.on("update", onAwareness);
    pushCollaborators(provider, api);

    const seedYjsFromExcalidrawIfEmpty = () => {
      if (!api || yElements.length > 0) return;
      const elements = api.getSceneElements();
      suppressLocalRef.current = true;
      doc.transact(() => {
        for (const el of elements) {
          const yEl = new Y.Map<unknown>();
          for (const [k, v] of Object.entries(el)) {
            yEl.set(k, v);
          }
          yElements.push([yEl]);
        }
      });
      suppressLocalRef.current = false;
    };

    const onSync = (...args: unknown[]) => {
      if (args[0] === true) seedYjsFromExcalidrawIfEmpty();
    };
    provider.on("sync", onSync);

    const onStatus = (event: unknown) => {
      const { status } = event as { status: string };
      setState((prev) => {
        const base = prev ?? { provider, doc, status: "connecting" as const };
        return {
          ...base,
          provider,
          doc,
          status: status as YjsSyncState["status"],
        };
      });
    };
    provider.on("status", onStatus);

    queueMicrotask(() => {
      setState({ provider, doc, status: "connecting" });
    });

    return () => {
      provider.awareness.off("update", onAwareness);
      provider.off("status", onStatus);
      provider.off("sync", onSync);
      yElements.unobserveDeep(flushElements);
      ySceneFiles.unobserve(onYFiles);
      provider.disconnect();
      provider.destroy();
      doc.destroy();
      setState(null);
    };
  }, [
    roomId,
    userName,
    api,
    enabled,
    applySceneFilesFromY,
    pushCollaborators,
  ]);

  return useMemo(
    () => ({
      state,
      onElementsChange,
      onSceneFilesChange,
      handlePointerUpdate,
    }),
    [state, onElementsChange, onSceneFilesChange, handlePointerUpdate]
  );
}

function generateUserColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}
