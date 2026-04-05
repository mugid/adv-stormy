import type {
  Collaborator,
  SocketId,
} from "@excalidraw/excalidraw/types";
import type { WebsocketProvider } from "y-websocket";

type AwarenessPayload = {
  user?: { name?: string; color?: string };
  pointer?: { x: number; y: number; tool?: "pointer" | "laser" };
};

function hslToCollaboratorColors(hsl: string): Collaborator["color"] {
  return { stroke: hsl, background: hsl };
}

/** Builds Excalidraw's collaborator map from y-websocket awareness (peers only). */
export function awarenessPeersToCollaborators(
  awareness: WebsocketProvider["awareness"],
): Map<SocketId, Collaborator> {
  const map = new Map<SocketId, Collaborator>();
  const states = awareness.getStates() as Map<number, AwarenessPayload>;
  states.forEach((payload, clientId) => {
    if (clientId === awareness.clientID) return;
    const name = payload.user?.name ?? "Collaborator";
    const hsl = payload.user?.color ?? "hsl(220, 70%, 50%)";
    const p = payload.pointer;
    const hasPtr =
      p && Number.isFinite(p.x) && Number.isFinite(p.y);
    const c = {
      username: name,
      color: hslToCollaboratorColors(hsl),
      socketId: String(clientId) as SocketId,
      ...(hasPtr
        ? {
            pointer: {
              x: p!.x,
              y: p!.y,
              tool: (p!.tool ?? "pointer") as "pointer" | "laser",
            },
          }
        : {}),
    } satisfies Collaborator;
    map.set(String(clientId) as SocketId, c);
  });
  return map;
}

export function stableColorForUserName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}
