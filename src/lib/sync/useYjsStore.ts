"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import * as Y from "yjs";
import type { Transaction } from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { YjsSceneFileEntry } from "@/lib/excalidraw/board-scene-files";
import { awarenessPeersToCollaborators, stableColorForUserName } from "./yjs-awareness";
import {
  YDOC_ELEMENTS,
  YDOC_SCENE_FILES,
  appendYElementsFromExcalidraw,
  pushYElementsToExcalidraw,
  replaceYElementsFromExcalidraw,
} from "./yjs-board-bridge";

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

async function fetchUrlToBinaryFile(
  fileId: string,
  url: string,
  mimeType: string,
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

/**
 * Realtime board sync: one Y.Doc per room, replicated over y-websocket.
 * See `ARCHITECTURE.md` in this folder for the full data flow.
 */
export function useYjsStore(
  roomId: string,
  api: ExcalidrawImperativeAPI | null,
  options?: UseYjsOptions,
) {
  const userName = options?.userName;
  const enabled = options?.enabled ?? true;

  const [state, setState] = useState<YjsSyncState | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  /** When true, ignore Excalidraw onChange echo (remote updateScene / addFiles). */
  const applyingRemoteRef = useRef(false);
  const applyingSceneFilesRef = useRef(false);

  const pushCollaborators = useCallback(
    (provider: WebsocketProvider | null, excalidrawApi: ExcalidrawImperativeAPI) => {
      if (!provider) return;
      applyingRemoteRef.current = true;
      try {
        excalidrawApi.updateScene({
          appState: {
            collaborators: awarenessPeersToCollaborators(provider.awareness),
          },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      } catch {
        /* ignore */
      }
      applyingRemoteRef.current = false;
    },
    [],
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
          fetchUrlToBinaryFile(fileId, e.url, e.mimeType).catch(() => null),
        );
      });
      const resolved = (await Promise.all(batch)).filter(
        (x): x is BinaryFilePayload => x != null,
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
    [],
  );

  const onElementsChange = useCallback(
    (elements: readonly ExcalidrawElement[]) => {
      if (applyingRemoteRef.current) return;
      const doc = docRef.current;
      if (!doc) return;
      replaceYElementsFromExcalidraw(
        doc,
        doc.getArray<Y.Map<unknown>>(YDOC_ELEMENTS),
        elements,
      );
    },
    [],
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
      const yFiles = doc.getMap<unknown>(YDOC_SCENE_FILES);
      doc.transact(() => {
        for (const [id, entry] of Object.entries(patch)) {
          if (!entry?.url) continue;
          const cur = yFiles.get(id) as YjsSceneFileEntry | undefined;
          if (cur?.url === entry.url && cur?.mimeType === entry.mimeType) {
            continue;
          }
          yFiles.set(id, { url: entry.url, mimeType: entry.mimeType });
        }
      });
    },
    [],
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
    [],
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
        color: stableColorForUserName(userName),
      });
    }

    const yElements = doc.getArray<Y.Map<unknown>>(YDOC_ELEMENTS);
    const ySceneFiles = doc.getMap<unknown>(YDOC_SCENE_FILES);

    const flushElementsFromRemoteWire = () => {
      const drawApi = apiRef.current;
      if (!drawApi) return;
      pushYElementsToExcalidraw(yElements, drawApi, applyingRemoteRef);
    };

    const onDocUpdate = (_u: Uint8Array, origin: unknown) => {
      if (origin !== provider) return;
      flushElementsFromRemoteWire();
    };
    doc.on("update", onDocUpdate);

    const onRemoteSceneFiles = (_e: unknown, tx: Transaction) => {
      if (tx.local) return;
      const drawApi = apiRef.current;
      if (drawApi) void applySceneFilesFromY(ySceneFiles, drawApi);
    };
    ySceneFiles.observe(onRemoteSceneFiles);

    const onAwareness = () => {
      const drawApi = apiRef.current;
      if (drawApi) pushCollaborators(provider, drawApi);
    };
    provider.awareness.on("update", onAwareness);

    const tryPullInitialFiles = () => {
      const drawApi = apiRef.current;
      if (drawApi) void applySceneFilesFromY(ySceneFiles, drawApi);
    };
    tryPullInitialFiles();
    onAwareness();

    const afterFirstSync = (...args: unknown[]) => {
      if (args[0] !== true) return;
      const drawApi = apiRef.current;
      appendYElementsFromExcalidraw(
        doc,
        yElements,
        drawApi ? drawApi.getSceneElements() : [],
      );
    };
    provider.on("sync", afterFirstSync);

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
      provider.off("sync", afterFirstSync);
      doc.off("update", onDocUpdate);
      ySceneFiles.unobserve(onRemoteSceneFiles);
      provider.disconnect();
      provider.destroy();
      doc.destroy();
      setState(null);
    };
  }, [roomId, userName, enabled, applySceneFilesFromY, pushCollaborators]);

  /*
   * Excalidraw often mounts after the websocket has already applied the first
   * server update. Reconcile once api exists: pull remote elements (and files)
   * into the canvas, or seed Y from the restored scene when Y is still empty.
   */
  useLayoutEffect(() => {
    if (!enabled || !api) return;
    const doc = docRef.current;
    if (!doc) return;
    const yElements = doc.getArray<Y.Map<unknown>>(YDOC_ELEMENTS);
    const ySceneFiles = doc.getMap<unknown>(YDOC_SCENE_FILES);

    void applySceneFilesFromY(ySceneFiles, api);

    if (yElements.length > 0) {
      pushYElementsToExcalidraw(yElements, api, applyingRemoteRef);
      return;
    }

    appendYElementsFromExcalidraw(doc, yElements, api.getSceneElements());
  }, [api, enabled, roomId, applySceneFilesFromY]);

  return useMemo(
    () => ({
      state,
      onElementsChange,
      onSceneFilesChange,
      handlePointerUpdate,
    }),
    [state, onElementsChange, onSceneFilesChange, handlePointerUpdate],
  );
}
