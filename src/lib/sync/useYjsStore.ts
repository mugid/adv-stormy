"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type {
  Collaborator,
  ExcalidrawImperativeAPI,
  SocketId,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import * as Y from "yjs";
import type { Transaction } from "yjs";
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
  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  /**
   * True while we are applying remote Y data into Excalidraw via updateScene/addFiles.
   * While true, onElementsChange DROPS calls — the elements came from our own
   * updateScene and must NOT be echoed back into Yjs (that creates a ping-pong loop).
   */
  const applyingRemoteRef = useRef(false);
  const applyingSceneFilesRef = useRef(false);

  const pushCollaborators = useCallback(
    (provider: WebsocketProvider | null, excalidrawApi: ExcalidrawImperativeAPI) => {
      if (!provider) return;
      const collaborators = awarenessToCollaborators(provider.awareness);
      applyingRemoteRef.current = true;
      try {
        excalidrawApi.updateScene({
          appState: { collaborators },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      } catch {
        /* ignore */
      }
      applyingRemoteRef.current = false;
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
        applyingRemoteRef.current = true;
        try {
          excalidrawApi.addFiles(resolved);
        } catch {
          /* ignore */
        }
        applyingRemoteRef.current = false;
      }
      applyingSceneFilesRef.current = false;
    },
    []
  );

  /**
   * Called from Board.tsx onChange for every local edit.
   * MUST NOT run when we are applying remote data (applyingRemoteRef),
   * otherwise we echo the remote elements back into Yjs → infinite loop.
   */
  const onElementsChange = useCallback(
    (elements: readonly ExcalidrawElement[]) => {
      if (applyingRemoteRef.current) return;
      const doc = docRef.current;
      if (!doc) return;
      const yEls = doc.getArray<Y.Map<unknown>>("elements");
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
    },
    []
  );

  const onSceneFilesChange = useCallback(
    (patch: Record<string, YjsSceneFileEntry>) => {
      const doc = docRef.current;
      if (
        applyingRemoteRef.current ||
        !doc ||
        applyingSceneFilesRef.current
      ) {
        return;
      }
      const yFiles = doc.getMap<unknown>("sceneFiles");
      doc.transact(() => {
        for (const [id, entry] of Object.entries(patch)) {
          if (!entry?.url) continue;
          const cur = yFiles.get(id) as YjsSceneFileEntry | undefined;
          if (cur?.url === entry.url && cur?.mimeType === entry.mimeType)
            continue;
          yFiles.set(id, { url: entry.url, mimeType: entry.mimeType });
        }
      });
    },
    []
  );

  const handlePointerUpdate = useCallback(
    (payload: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "down" | "up";
    }) => {
      const provider = providerRef.current;
      if (!provider || applyingRemoteRef.current) return;
      provider.awareness.setLocalStateField("pointer", {
        x: payload.pointer.x,
        y: payload.pointer.y,
        tool: payload.pointer.tool,
        button: payload.button,
      });
    },
    []
  );

  useLayoutEffect(() => {
    apiRef.current = api;
  }, [api]);

  useLayoutEffect(() => {
    if (!enabled) {
      docRef.current = null;
      providerRef.current = null;
      queueMicrotask(() => setState(null));
      return;
    }

    const doc = new Y.Doc();
    docRef.current = doc;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:1234";

    const provider = new WebsocketProvider(wsUrl, roomId, doc, {
      connect: true,
    });
    providerRef.current = provider;

    if (userName) {
      provider.awareness.setLocalStateField("user", {
        name: userName,
        color: generateUserColor(userName),
      });
    }

    const yElements = doc.getArray<Y.Map<unknown>>("elements");
    const ySceneFiles = doc.getMap<unknown>("sceneFiles");

    /**
     * Apply remote Y elements into Excalidraw.
     * Only called when we know the update came from the WebSocket provider.
     */
    const flushRemoteElements = () => {
      const drawApi = apiRef.current;
      if (!drawApi) return;
      if (yElements.length === 0) return;
      const elements: ExcalidrawElement[] = [];
      yElements.forEach((yEl) => {
        if (yEl) elements.push(yEl.toJSON() as ExcalidrawElement);
      });
      applyingRemoteRef.current = true;
      try {
        drawApi.updateScene({
          elements,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      } catch {
        /* race on init */
      }
      applyingRemoteRef.current = false;
    };

    /**
     * doc 'update' fires after each transaction with (update, origin, doc, transaction).
     * When origin === provider the update came from the WebSocket (remote peer).
     * This is the only case where we need to push Y state into Excalidraw.
     */
    const onDocUpdate = (
      _update: Uint8Array,
      origin: unknown,
    ) => {
      if (origin !== provider) return;
      flushRemoteElements();
    };
    doc.on("update", onDocUpdate);

    const onYFiles = (_event: unknown, transaction: Transaction) => {
      if (transaction.local) return;
      const drawApi = apiRef.current;
      if (drawApi) void applySceneFilesFromY(ySceneFiles, drawApi);
    };
    ySceneFiles.observe(onYFiles);
    {
      const drawApi = apiRef.current;
      if (drawApi) void applySceneFilesFromY(ySceneFiles, drawApi);
    }

    const onAwareness = () => {
      const drawApi = apiRef.current;
      if (drawApi) pushCollaborators(provider, drawApi);
    };
    provider.awareness.on("update", onAwareness);
    {
      const drawApi = apiRef.current;
      if (drawApi) pushCollaborators(provider, drawApi);
    }

    const seedYjsFromExcalidrawIfEmpty = () => {
      const drawApi = apiRef.current;
      if (!drawApi || yElements.length > 0) return;
      const elements = drawApi.getSceneElements();
      doc.transact(() => {
        for (const el of elements) {
          const yEl = new Y.Map<unknown>();
          for (const [k, v] of Object.entries(el)) {
            yEl.set(k, v);
          }
          yElements.push([yEl]);
        }
      });
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
      docRef.current = null;
      providerRef.current = null;
      provider.awareness.off("update", onAwareness);
      provider.off("status", onStatus);
      provider.off("sync", onSync);
      doc.off("update", onDocUpdate);
      ySceneFiles.unobserve(onYFiles);
      provider.disconnect();
      provider.destroy();
      doc.destroy();
      setState(null);
    };
  }, [roomId, userName, enabled, applySceneFilesFromY, pushCollaborators]);

  useLayoutEffect(() => {
    if (!enabled || !api) return;
    const doc = docRef.current;
    if (!doc) return;
    const yElements = doc.getArray<Y.Map<unknown>>("elements");
    if (yElements.length > 0) return;
    const elements = api.getSceneElements();
    if (elements.length === 0) return;
    doc.transact(() => {
      for (const el of elements) {
        const yEl = new Y.Map<unknown>();
        for (const [k, v] of Object.entries(el)) {
          yEl.set(k, v);
        }
        yElements.push([yEl]);
      }
    });
  }, [api, enabled, roomId]);

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
