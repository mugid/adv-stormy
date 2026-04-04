# Collaboration (Yjs + WebSocket)

## Overview

Real-time canvas sync uses [Yjs](https://yjs.dev) with the [`y-websocket`](https://github.com/yjs/y-websocket) provider. Each board uses `boardId` as the WebSocket **room name**.

- **Elements** replicate through a shared `Y.Array`.
- **ImageKit-backed assets** replicate through a shared `Y.Map` (`fileId` → `{ url, mimeType }`); clients fetch URLs and call `addFiles`.
- **Presence** uses Yjs **awareness** (name, color, pointer) mapped to Excalidraw `collaborators`.
- **HTTP PATCH** (`sceneJson`, `sceneFiles`) remains the durable snapshot for reloads and viewers joining before the WS syncs; editors with `canEdit` continue to debounce-save.

## Development

```bash
# Terminal 1
pnpm dev

# Terminal 2 — WebSocket server (default port 1234)
pnpm dev:ws
```

Optional: `pnpm dev:all` if your shell runs both.

Set `NEXT_PUBLIC_WS_URL=ws://localhost:1234` in `.env` (this is the default in code if unset).

## Production deployment

1. **Run the WebSocket server** on a long-lived host (Fly.io, Railway, Render, a small VPS, etc.). The stock server is `y-websocket-server` from devDependencies; install/run it in production or use an equivalent that speaks the y-websocket protocol.

2. **Use TLS**: the browser app is served over `https://`, so the client must use **`wss://`** (not `ws://`). Set:

   ```bash
   NEXT_PUBLIC_WS_URL=wss://your-collab.example.com
   ```

3. **Scaling**: a single `y-websocket` process holds state in memory. Multiple WS instances require a shared backend (e.g. Redis via community extensions) or a hosted CRDT service (PartyKit, Liveblocks, etc.). For a single-region MVP, one WS replica is enough.

4. **Security**
   - **App layer:** Only users who pass `GET /api/boards/[id]` (owner or `board_members`) should open the board UI; the hook connects only after the board load succeeds.
   - **Network layer:** The stock y-websocket server does **not** verify JWTs. Anyone who knows a `boardId` could subscribe to that room. For stricter isolation, run a custom WebSocket server that validates a short-lived token or session cookie before attaching to Yjs.

5. **CORS / cookies:** The WebSocket connection does not go through Next.js middleware; it targets your WS host directly. Ensure that host allows connections from your web app origin if you add browser checks on the server.

## Inviting collaborators

- `POST /api/boards/[id]/members` with `{ "email": "user@example.com", "role": "editor" | "viewer" }` (owner only). The user must already exist (same auth provider).
- `GET /api/boards/[id]/members` lists members (owner only).
- `DELETE /api/boards/[id]/members?userId=...` removes a member (owner only).

Editors can edit the canvas and run media generation tied to the board; viewers get live updates but `PATCH` and mutations are rejected with `403`.
