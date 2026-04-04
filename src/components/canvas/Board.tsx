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
import { AgentPanel, type CanvasInputMode, type AgentMessage } from "./AgentPanel";
import { BoardInviteDialog } from "./BoardInviteDialog";
import { AgentCursor } from "./AgentCursor";
import { useCanvasAgent } from "@/lib/agent/use-canvas-agent";
import { placeRemoteImageOnCanvas } from "@/lib/excalidraw/place-remote-image";
import {
  collectReferencedImageFileIds,
  dataURLToUploadFile,
  hydrateBoardSceneFiles,
  buildSceneFilePatchForYjs,
  type BoardSceneFiles,
} from "@/lib/excalidraw/board-scene-files";
import { uploadBoardFileViaImageKit } from "@/lib/imagekit/client-upload";
import { useYjsStore } from "@/lib/sync/useYjsStore";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Clapperboard, X } from "lucide-react";

const imageKitConfigured =
  typeof process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY === "string" &&
  process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY.length > 0;

interface BoardProps {
  boardId: string;
}

const SAVE_DEBOUNCE_MS = 650;

async function pollMediaUntilTerminal(requestId: string) {
  const intervalMs = 2500;
  for (;;) {
    const res = await fetch(
      `/api/media/higgsfield/status?requestId=${encodeURIComponent(requestId)}`
    );
    const data = (await res.json()) as {
      terminal?: boolean;
      status?: string;
      error?: string;
      images?: Array<{ url: string }>;
      video?: { url: string };
    };
    if (!res.ok) {
      throw new Error((data as { error?: string }).error ?? "Status request failed");
    }
    if (data.terminal) {
      return data;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export function Board({ boardId }: BoardProps) {
  const { data: session } = useSession();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  const canEditRef = useRef(true);
  const [boot, setBoot] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; initialData: ReturnType<typeof restore> }
  >({ status: "loading" });
  const persistOkRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const serverSceneFilesRef = useRef<BoardSceneFiles>({});
  const uploadCacheRef = useRef(
    new Map<string, { dataURL: string; url: string }>(),
  );
  const lastPersistedAgentVideoRef = useRef<string | null>(null);
  const collabSeedDoneRef = useRef(false);
  const [boardRole, setBoardRole] = useState<
    "owner" | "editor" | "viewer" | null
  >(null);
  const agent = useCanvasAgent(api);

  const collabApi =
    boot.status === "ready" ? api : null;
  const yjs = useYjsStore(boardId, collabApi, {
    userName: session?.user?.name ?? session?.user?.email ?? "Guest",
    enabled: boot.status === "ready",
  });

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  const persistPinnedVideo = useCallback(async (url: string | null) => {
    if (!canEditRef.current) return;
    try {
      await fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinnedVideoUrl: url }),
      });
    } catch (e) {
      console.error("Failed to save pinned video", e);
    }
  }, [boardId]);

  const [inputMode, setInputMode] = useState<CanvasInputMode>("brainstorm");
  const [mediaLog, setMediaLog] = useState<AgentMessage[]>([]);
  const [isMediaBusy, setIsMediaBusy] = useState(false);
  const [mediaHint, setMediaHint] = useState("");
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  /** When true, the player is hidden but `pinnedVideoUrl` (and local URL) stay for recovery */
  const [videoOverlayDismissed, setVideoOverlayDismissed] = useState(false);

  const panelMessages = inputMode === "brainstorm" ? agent.messages : mediaLog;
  const videoUrl = localVideoUrl ?? agent.generatedVideoUrl;
  const showVideoPlayer = Boolean(videoUrl) && !videoOverlayDismissed;
  const hasRecoverableVideo = Boolean(videoUrl) && videoOverlayDismissed;

  const dismissVideoOverlay = useCallback(() => {
    const u = localVideoUrl ?? agent.generatedVideoUrl;
    if (u) setLocalVideoUrl(u);
    setVideoOverlayDismissed(true);
    agent.clearGeneratedVideo();
  }, [agent, localVideoUrl]);

  const openVideoOverlay = useCallback(() => {
    setVideoOverlayDismissed(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    persistOkRef.current = false;
    setBoardRole(null);
    setBoot({ status: "loading" });

    async function load() {
      lastPersistedAgentVideoRef.current = null;
      collabSeedDoneRef.current = false;
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

      const data: {
        sceneJson?: string | null;
        sceneFiles?: BoardSceneFiles | null;
        pinnedVideoUrl?: string | null;
        canEdit?: boolean;
        role?: "owner" | "editor" | "viewer";
      } = await res.json();
      if (cancelled) return;

      setBoardRole(data.role ?? null);
      setCanEdit(data.canEdit !== false);
      serverSceneFilesRef.current = data.sceneFiles ?? {};
      uploadCacheRef.current.clear();
      setLocalVideoUrl(data.pinnedVideoUrl ?? null);
      setVideoOverlayDismissed(false);

      let initial: ReturnType<typeof restore>;
      if (data.sceneJson && data.sceneJson.length > 0) {
        try {
          const parsed = JSON.parse(data.sceneJson) as ImportedDataState;
          const elements = parsed.elements ?? [];
          const embedded = parsed.files ?? {};
          const referenced = collectReferencedImageFileIds(elements);
          let files = embedded;
          if (!embedded || Object.keys(embedded).length === 0) {
            files = await hydrateBoardSceneFiles(
              referenced,
              data.sceneFiles ?? undefined,
            );
          }
          for (const id of referenced) {
            const f = files[id];
            const url = data.sceneFiles?.[id]?.url;
            if (f?.dataURL && url) {
              uploadCacheRef.current.set(id, {
                dataURL: f.dataURL as string,
                url,
              });
            }
          }

          initial = restore(
            {
              elements,
              appState: parsed.appState,
              files,
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
    const u = agent.generatedVideoUrl;
    if (!u || u === lastPersistedAgentVideoRef.current) return;
    if (!canEditRef.current) return;
    lastPersistedAgentVideoRef.current = u;
    setLocalVideoUrl(u);
    setVideoOverlayDismissed(false);
    void persistPinnedVideo(u);
  }, [agent.generatedVideoUrl, persistPinnedVideo]);

  useEffect(() => {
    if (boot.status !== "ready") return;
    collabSeedDoneRef.current = false;
  }, [boardId, boot.status]);

  useEffect(() => {
    if (
      boot.status !== "ready" ||
      yjs.state?.status !== "connected" ||
      !api ||
      collabSeedDoneRef.current ||
      !canEdit
    ) {
      return;
    }
    collabSeedDoneRef.current = true;
    const patch = buildSceneFilePatchForYjs(
      api.getSceneElements(),
      api.getFiles(),
      serverSceneFilesRef.current,
      uploadCacheRef.current,
    );
    if (Object.keys(patch).length > 0) {
      yjs.onSceneFilesChange(patch);
    }
  }, [yjs.state?.status, yjs.onSceneFilesChange, api, canEdit, boot.status]);

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
      if (!persistOkRef.current || !canEditRef.current) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void (async () => {
          try {
            if (!canEditRef.current) return;
            if (!imageKitConfigured) {
              const sceneJson = serializeAsJSON(
                elements,
                appState,
                files,
                "local",
              );
              await fetch(`/api/boards/${boardId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sceneJson }),
              });
              return;
            }

            const sceneJson = serializeAsJSON(
              elements,
              appState,
              files,
              "database",
            );
            const referenced = collectReferencedImageFileIds(elements);
            const nextSceneFiles: BoardSceneFiles = {};

            for (const id of referenced) {
              const local = files[id];
              if (local) {
                const d = local.dataURL as string;
                const cached = uploadCacheRef.current.get(id);
                if (cached?.dataURL === d && cached.url) {
                  nextSceneFiles[id] = {
                    url: cached.url,
                    mimeType: local.mimeType,
                  };
                } else {
                  try {
                    const uploadFile = dataURLToUploadFile(
                      d,
                      local.mimeType,
                      id,
                    );
                    const { url } = await uploadBoardFileViaImageKit(
                      boardId,
                      id,
                      uploadFile,
                    );
                    uploadCacheRef.current.set(id, { dataURL: d, url });
                    nextSceneFiles[id] = { url, mimeType: local.mimeType };
                  } catch {
                    const fallback = serverSceneFilesRef.current[id];
                    if (fallback) nextSceneFiles[id] = fallback;
                  }
                }
              } else if (serverSceneFilesRef.current[id]) {
                nextSceneFiles[id] = serverSceneFilesRef.current[id]!;
              }
            }

            await fetch(`/api/boards/${boardId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sceneJson, sceneFiles: nextSceneFiles }),
            });
            serverSceneFilesRef.current = nextSceneFiles;
          } catch (err) {
            console.error("Failed to save board", err);
          }
        })();
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
      if (canEdit && yjs.state) {
        yjs.onElementsChange(elements);
        yjs.onSceneFilesChange(
          buildSceneFilePatchForYjs(
            elements,
            files,
            serverSceneFilesRef.current,
            uploadCacheRef.current,
          ),
        );
      }
    },
    [scheduleSave, canEdit, yjs],
  );

  const handleImageSubmit = useCallback(
    async (payload: {
      prompt: string;
      aspectRatio?: string;
      resolution?: string;
    }) => {
      if (!api) return;
      setIsMediaBusy(true);
      setMediaHint("queued");
      setMediaLog((prev) => [
        ...prev,
        { role: "user", content: payload.prompt, timestamp: Date.now() },
      ]);
      try {
        const startRes = await fetch("/api/media/higgsfield/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "image",
            boardId,
            prompt: payload.prompt,
            aspect_ratio: payload.aspectRatio,
            resolution: payload.resolution,
          }),
        });
        const startJson = (await startRes.json()) as {
          error?: string;
          requestId?: string;
        };
        if (!startRes.ok) {
          throw new Error(startJson.error ?? "Failed to start generation");
        }
        const requestId = startJson.requestId!;
        setMediaHint("generating");
        const result = await pollMediaUntilTerminal(requestId);
        if (result.status === "completed" && result.images?.[0]?.url) {
          await placeRemoteImageOnCanvas(api, result.images[0].url);
          setMediaLog((prev) => [
            ...prev,
            {
              role: "agent",
              content: "Image added to the canvas.",
              timestamp: Date.now(),
            },
          ]);
        } else if (result.status === "nsfw") {
          setMediaLog((prev) => [
            ...prev,
            {
              role: "agent",
              content: "Generation was blocked (nsfw).",
              timestamp: Date.now(),
            },
          ]);
        } else {
          throw new Error(result.error ?? `Status: ${result.status}`);
        }
      } catch (e) {
        setMediaLog((prev) => [
          ...prev,
          {
            role: "agent",
            content: e instanceof Error ? e.message : "Generation failed",
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsMediaBusy(false);
        setMediaHint("");
      }
    },
    [api, boardId],
  );

  const handleVideoSubmit = useCallback(
    async (payload: { imageUrl: string; prompt: string; duration?: number }) => {
      if (!api) return;
      setIsMediaBusy(true);
      setMediaHint("queued");
      setMediaLog((prev) => [
        ...prev,
        {
          role: "user",
          content: `${payload.prompt}\n(${payload.imageUrl})`,
          timestamp: Date.now(),
        },
      ]);
      try {
        const startRes = await fetch("/api/media/higgsfield/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "video",
            boardId,
            image_url: payload.imageUrl,
            prompt: payload.prompt,
            duration: payload.duration,
          }),
        });
        const startJson = (await startRes.json()) as {
          error?: string;
          requestId?: string;
        };
        if (!startRes.ok) {
          throw new Error(startJson.error ?? "Failed to start video");
        }
        const requestId = startJson.requestId!;
        setMediaHint("generating");
        const result = await pollMediaUntilTerminal(requestId);
        if (result.status === "completed" && result.video?.url) {
          const vUrl = result.video.url;
          setLocalVideoUrl(vUrl);
          setVideoOverlayDismissed(false);
          lastPersistedAgentVideoRef.current = vUrl;
          void persistPinnedVideo(vUrl);
          setMediaLog((prev) => [
            ...prev,
            {
              role: "agent",
              content: "Video ready — see player above the canvas.",
              timestamp: Date.now(),
            },
          ]);
        } else if (result.status === "nsfw") {
          setMediaLog((prev) => [
            ...prev,
            {
              role: "agent",
              content: "Video generation was blocked (nsfw).",
              timestamp: Date.now(),
            },
          ]);
        } else {
          throw new Error(result.error ?? `Status: ${result.status}`);
        }
      } catch (e) {
        setMediaLog((prev) => [
          ...prev,
          {
            role: "agent",
            content: e instanceof Error ? e.message : "Video generation failed",
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsMediaBusy(false);
        setMediaHint("");
      }
    },
    [api, boardId, persistPinnedVideo],
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
      },
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
      {boot.status === "ready" && (
        <div className="absolute left-4 top-4 z-50 flex flex-wrap items-center gap-2">
          {boardRole === "owner" ? (
            <BoardInviteDialog boardId={boardId} />
          ) : null}
          <div className="rounded-md border border-border bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
            Live sync:{" "}
            <span className="font-medium text-foreground">
              {yjs.state?.status === "connected"
                ? "connected"
                : yjs.state?.status === "connecting"
                  ? "connecting…"
                  : yjs.state?.status === "disconnected"
                    ? "disconnected"
                    : "…"}
            </span>
            {!canEdit ? (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                View only
              </span>
            ) : null}
          </div>
        </div>
      )}
      {showVideoPlayer && (
        <div className="absolute right-4 top-4 z-50 w-full max-w-md rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Generated video
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={dismissVideoOverlay}
              aria-label="Hide video player"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <video
            src={videoUrl!}
            controls
            className="w-full rounded-md"
            playsInline
          />
        </div>
      )}
      {hasRecoverableVideo && (
        <div className="absolute right-4 top-4 z-50">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-2 shadow-md"
            onClick={openVideoOverlay}
          >
            <Clapperboard className="h-4 w-4" />
            Show video
          </Button>
        </div>
      )}
      <div className="absolute inset-0 z-0 [&_.excalidraw]:h-full [&_.excalidraw]:max-h-none">
        <Excalidraw
          key={boardId}
          excalidrawAPI={(a) => setApi(a)}
          initialData={boot.initialData}
          onChange={onExcalidrawChange}
          viewModeEnabled={!canEdit}
          isCollaborating={boot.status === "ready"}
          onPointerUpdate={yjs.handlePointerUpdate}
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
            mode={inputMode}
            onModeChange={setInputMode}
            canEdit={canEdit}
            onBrainstormSubmit={agent.prompt}
            onImageSubmit={handleImageSubmit}
            onVideoSubmit={handleVideoSubmit}
            messages={panelMessages}
            isBrainstormBusy={agent.isThinking}
            onBrainstormCancel={agent.cancel}
            isMediaBusy={isMediaBusy}
            mediaHint={mediaHint}
          />
        </>
      )}
    </div>
  );
}
