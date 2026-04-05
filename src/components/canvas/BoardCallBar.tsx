"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isRemoteParticipant,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { Button } from "@/components/ui/button";
import { useBrowserStt } from "@/lib/call/use-browser-stt";
import {
  Bot,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
} from "lucide-react";

type CallStatus = "idle" | "connecting" | "connected" | "error";

export interface BoardCallBarProps {
  boardId: string;
  canEdit: boolean;
  agentBusy: boolean;
  onVoicePrompt: (text: string) => void;
  /** Last assistant message for optional TTS */
  lastAssistantText: string | null;
}

export function BoardCallBar({
  boardId,
  canEdit,
  agentBusy,
  onVoicePrompt,
  lastAssistantText,
}: BoardCallBarProps) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [aiListen, setAiListen] = useState(false);
  const [voiceReply, setVoiceReply] = useState(false);
  const [lines, setLines] = useState<{ role: "you" | "status"; text: string }[]>(
    []
  );

  const roomRef = useRef<Room | null>(null);
  /** Holds detached `<audio>` elements for each remote mic track. */
  const remoteAudioContainerRef = useRef<HTMLDivElement | null>(null);
  const spokenRef = useRef<string | null>(null);
  const agentBusyRef = useRef(agentBusy);
  agentBusyRef.current = agentBusy;

  const pushLine = useCallback((role: "you" | "status", text: string) => {
    setLines((prev) => [...prev.slice(-50), { role, text }]);
  }, []);

  const logCallEvent = useCallback(
    async (kind: "call_join" | "call_leave" | "stt_final" | "call_error", payload?: Record<string, unknown>) => {
      try {
        await fetch(`/api/boards/${boardId}/call-events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, payload: payload ?? {} }),
        });
      } catch {
        /* ignore */
      }
    },
    [boardId]
  );

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      try {
        room.disconnect();
      } catch {
        /* ignore */
      }
    }
    const host = remoteAudioContainerRef.current;
    if (host) {
      host.replaceChildren();
    }
    setStatus("idle");
    setAiListen(false);
    await logCallEvent("call_leave");
  }, [logCallEvent]);

  useEffect(() => {
    const audioContainer = remoteAudioContainerRef.current;
    return () => {
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        try {
          room.disconnect();
        } catch {
          /* ignore */
        }
        audioContainer?.replaceChildren();
        void fetch(`/api/boards/${boardId}/call-events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "call_leave", payload: { reason: "unmount" } }),
        }).catch(() => {});
      }
    };
  }, [boardId]);

  const connect = useCallback(async () => {
    if (!canEdit) return;
    setError(null);
    setStatus("connecting");
    try {
      const res = await fetch(`/api/boards/${boardId}/call-token`);
      const data = (await res.json()) as {
        error?: string;
        hint?: string;
        url?: string;
        token?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Token failed (${res.status})`);
      }
      const { url, token } = data;
      if (!url || !token) throw new Error("Invalid token response");

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      room.on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        setStatus("idle");
        setAiListen(false);
        pushLine("status", "Disconnected from call");
      });
      room.on(RoomEvent.Reconnecting, () => {
        pushLine("status", "Reconnecting…");
      });

      const onRemoteTrackSubscribed = (
        track: RemoteTrack,
        _publication: RemoteTrackPublication,
        participant: Participant
      ) => {
        if (!isRemoteParticipant(participant)) return;
        if (track.kind !== Track.Kind.Audio) return;
        const host = remoteAudioContainerRef.current;
        if (!host) return;
        const audioEl = track.attach();
        audioEl.dataset.lkIdentity = participant.identity;
        audioEl.setAttribute("playsinline", "true");
        audioEl.autoplay = true;
        host.appendChild(audioEl);
        void audioEl.play().catch(() => {
          pushLine(
            "status",
            "Could not auto-play remote audio — tap the page or check browser permissions."
          );
        });
      };

      const onRemoteTrackUnsubscribed = (track: RemoteTrack) => {
        track.detach();
      };

      room
        .on(RoomEvent.TrackSubscribed, onRemoteTrackSubscribed)
        .on(RoomEvent.TrackUnsubscribed, onRemoteTrackUnsubscribed);

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(micOn);
      await room.startAudio().catch(() => {
        pushLine(
          "status",
          "Allow audio playback in the browser to hear other participants."
        );
      });
      roomRef.current = room;
      setStatus("connected");
      pushLine("status", "Joined voice room");
      void logCallEvent("call_join", { room: room.name });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not join call";
      setError(msg);
      setStatus("error");
      void logCallEvent("call_error", { message: msg });
    }
  }, [boardId, canEdit, logCallEvent, micOn, pushLine]);

  const toggleMic = useCallback(async () => {
    const next = !micOn;
    setMicOn(next);
    const room = roomRef.current;
    if (room) {
      try {
        await room.localParticipant.setMicrophoneEnabled(next);
      } catch {
        pushLine("status", "Could not toggle microphone");
      }
    }
  }, [micOn, pushLine]);

  useBrowserStt({
    enabled:
      status === "connected" && micOn && aiListen && canEdit,
    allowDispatch: !agentBusy,
    onFinalPhrase: (text) => {
      if (agentBusyRef.current) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      pushLine("you", trimmed);
      void logCallEvent("stt_final", { chars: trimmed.length });
      onVoicePrompt(trimmed);
    },
  });

  useEffect(() => {
    if (!voiceReply || !lastAssistantText?.trim()) return;
    if (spokenRef.current === lastAssistantText) return;
    spokenRef.current = lastAssistantText;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(lastAssistantText);
    u.lang = "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [lastAssistantText, voiceReply]);

  const sttSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
  }, []);

  if (!canEdit) return null;

  return (
    <>
      <div ref={remoteAudioContainerRef} className="sr-only" aria-hidden />
      <div className="absolute bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2 rounded-xl border border-border bg-background/95 p-3 text-sm shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">Board call</span>
        {status === "connected" ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="gap-1"
            onClick={() => void disconnect()}
          >
            <PhoneOff className="h-3.5 w-3.5" />
            Leave
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-1"
            disabled={status === "connecting"}
            onClick={() => void connect()}
          >
            {status === "connecting" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Phone className="h-3.5 w-3.5" />
            )}
            Join
          </Button>
        )}
      </div>

      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : status === "idle" ? (
        <p className="text-xs text-muted-foreground">
          LiveKit voice room (per board). Requires{" "}
          <code className="text-[10px]">LIVEKIT_*</code> env on the server.
        </p>
      ) : null}

      {status === "connected" ? (
        <div className="flex flex-col gap-2 border-t border-border pt-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={micOn ? "secondary" : "outline"}
              className="gap-1"
              onClick={() => void toggleMic()}
            >
              {micOn ? (
                <Mic className="h-3.5 w-3.5" />
              ) : (
                <MicOff className="h-3.5 w-3.5" />
              )}
              {micOn ? "Mic on" : "Mic off"}
            </Button>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={aiListen}
                onChange={(e) => setAiListen(e.target.checked)}
                className="rounded border-border"
              />
              <Bot className="h-3.5 w-3.5" />
              AI listens
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={voiceReply}
                onChange={(e) => setVoiceReply(e.target.checked)}
                className="rounded border-border"
              />
              {voiceReply ? (
                <Volume2 className="h-3.5 w-3.5" />
              ) : (
                <VolumeX className="h-3.5 w-3.5" />
              )}
              Voice reply
            </label>
          </div>
          {!sttSupported ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Speech recognition needs Chrome or Edge for live captions → agent.
            </p>
          ) : null}
          {aiListen && micOn ? (
            <p className="text-[11px] text-muted-foreground">
              Speak clearly. Final phrases are sent to Stormy when you pause.
            </p>
          ) : null}
        </div>
      ) : null}

      {lines.length > 0 && (
        <div className="max-h-28 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-2 text-[11px]">
          {lines.map((l, i) => (
            <div
              key={`${i}-${l.text.slice(0, 12)}`}
              className={
                l.role === "you" ? "text-accent-foreground" : "text-muted-foreground"
              }
            >
              {l.role === "you" ? "You: " : ""}
              {l.text}
            </div>
          ))}
        </div>
      )}
      </div>
    </>
  );
}
