/**
 * Minimal server-side LiveKit process: lists rooms so you can verify API keys
 * and extend toward a track-subscriber / egress worker (see LiveKit Agents).
 *
 * Run: `pnpm tsx src/call/optional-livekit-service-bot.ts`
 */
import { RoomServiceClient } from "livekit-server-sdk";

function httpUrlFromLiveKitUrl(url: string): string {
  if (url.startsWith("wss://")) return `https://${url.slice("wss://".length)}`;
  if (url.startsWith("ws://")) return `http://${url.slice("ws://".length)}`;
  return url;
}

async function main() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    console.error("Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET");
    process.exit(1);
  }

  const host = httpUrlFromLiveKitUrl(url.trim());
  const svc = new RoomServiceClient(host, apiKey.trim(), apiSecret.trim());
  const rooms = await svc.listRooms();
  console.log(
    `[livekit-worker] ${rooms.length} active room(s). Board rooms use prefix "board-".`
  );
  for (const r of rooms) {
    console.log(`  - ${r.name} (${r.numParticipants} participants)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
