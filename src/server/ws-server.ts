/**
 * Standalone y-websocket server for real-time collaboration.
 * Run with: npx tsx src/server/ws-server.ts
 */
import { WebSocketServer } from "ws";
import http from "http";

const HOST = process.env.WS_HOST ?? "0.0.0.0";
const PORT = parseInt(process.env.WS_PORT ?? "1234", 10);

async function main() {
  const { setupWSConnection } = await import("y-websocket/bin/utils");

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("y-websocket server running");
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    setupWSConnection(ws, req);
  });

  server.listen(PORT, HOST, () => {
    console.log(`y-websocket server listening on ${HOST}:${PORT}`);
  });
}

main().catch(console.error);
