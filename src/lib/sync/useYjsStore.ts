"use client";

import { useEffect, useState } from "react";
import { createTLStore, defaultShapeUtils, type TLRecord } from "tldraw";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

interface YjsSyncState {
  store: ReturnType<typeof createTLStore>;
  provider: WebsocketProvider;
  doc: Y.Doc;
  status: "connecting" | "connected" | "disconnected";
}

export function useYjsStore(roomId: string, userName?: string) {
  const [state, setState] = useState<YjsSyncState | null>(null);

  useEffect(() => {
    const doc = new Y.Doc();
    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:1234";

    const provider = new WebsocketProvider(wsUrl, roomId, doc, {
      connect: true,
    });

    if (userName) {
      provider.awareness.setLocalStateField("user", {
        name: userName,
        color: generateUserColor(userName),
      });
    }

    const yShapes = doc.getMap<Y.Map<unknown>>("shapes");
    const yBindings = doc.getMap<Y.Map<unknown>>("bindings");

    const store = createTLStore({ shapeUtils: defaultShapeUtils });

    function syncFromYjs() {
      const records: TLRecord[] = [];

      yShapes.forEach((yShape) => {
        if (yShape) {
          records.push(yShape.toJSON() as TLRecord);
        }
      });
      yBindings.forEach((yBinding) => {
        if (yBinding) {
          records.push(yBinding.toJSON() as TLRecord);
        }
      });

      try {
        store.mergeRemoteChanges(() => {
          const existing = store.allRecords();
          const existingIds = new Set(existing.map((r) => r.id));
          const newIds = new Set(records.map((r) => r.id));

          const toRemove = existing.filter((r) => !newIds.has(r.id));
          const toAdd = records.filter((r) => !existingIds.has(r.id));
          const toUpdate = records.filter((r) => existingIds.has(r.id));

          if (toRemove.length) store.remove(toRemove.map((r) => r.id));
          if (toAdd.length) store.put(toAdd);
          if (toUpdate.length) store.put(toUpdate);
        });
      } catch {
        // Sync errors on first init are expected
      }
    }

    const removeListener = store.listen(
      ({ changes }) => {
        doc.transact(() => {
          for (const record of Object.values(changes.added)) {
            const yRecord = new Y.Map<unknown>();
            for (const [k, v] of Object.entries(record)) {
              yRecord.set(k, v);
            }
            if (record.typeName === "shape") {
              yShapes.set(record.id, yRecord);
            } else if (record.typeName === "binding") {
              yBindings.set(record.id, yRecord);
            }
          }

          for (const [, to] of Object.values(changes.updated)) {
            const target =
              to.typeName === "shape"
                ? yShapes
                : to.typeName === "binding"
                  ? yBindings
                  : null;
            if (!target) continue;
            const yRecord = target.get(to.id) ?? new Y.Map<unknown>();
            for (const [k, v] of Object.entries(to)) {
              yRecord.set(k, v);
            }
            target.set(to.id, yRecord);
          }

          for (const record of Object.values(changes.removed)) {
            if (record.typeName === "shape") {
              yShapes.delete(record.id);
            } else if (record.typeName === "binding") {
              yBindings.delete(record.id);
            }
          }
        });
      },
      { source: "user", scope: "document" }
    );

    yShapes.observeDeep(() => syncFromYjs());
    yBindings.observeDeep(() => syncFromYjs());

    provider.on("status", (event: unknown) => {
      const { status } = event as { status: string };
      setState((prev) =>
        prev
          ? { ...prev, status: status as YjsSyncState["status"] }
          : prev
      );
    });

    setState({ store, provider, doc, status: "connecting" });

    return () => {
      removeListener();
      provider.disconnect();
      provider.destroy();
      doc.destroy();
    };
  }, [roomId, userName]);

  return state;
}

function generateUserColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}
