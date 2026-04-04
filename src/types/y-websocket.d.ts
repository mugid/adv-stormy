declare module "y-websocket" {
  import * as Y from "yjs";
  import { Awareness } from "y-protocols/awareness";

  export class WebsocketProvider {
    awareness: Awareness;
    wsconnected: boolean;
    ws: WebSocket | null;
    doc: Y.Doc;

    constructor(
      serverUrl: string,
      roomname: string,
      doc: Y.Doc,
      opts?: {
        connect?: boolean;
        awareness?: Awareness;
        params?: Record<string, string>;
        WebSocketPolyfill?: typeof WebSocket;
        resyncInterval?: number;
        maxBackoffTime?: number;
        disableBc?: boolean;
      }
    );

    on(event: string, callback: (...args: unknown[]) => void): void;
    off(event: string, callback: (...args: unknown[]) => void): void;
    connect(): void;
    disconnect(): void;
    destroy(): void;
  }
}

declare module "y-protocols/awareness" {
  import * as Y from "yjs";

  export class Awareness {
    doc: Y.Doc;
    clientID: number;

    constructor(doc: Y.Doc);

    getLocalState(): Record<string, unknown> | null;
    setLocalState(state: Record<string, unknown> | null): void;
    setLocalStateField(field: string, value: unknown): void;
    getStates(): Map<number, Record<string, unknown>>;
    on(event: string, callback: (...args: unknown[]) => void): void;
    off(event: string, callback: (...args: unknown[]) => void): void;
    destroy(): void;
  }
}
