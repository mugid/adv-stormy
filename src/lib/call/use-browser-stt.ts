"use client";

import { useEffect, useRef } from "react";

function getSpeechRecognitionCtor(): { new (): SpeechRecognition } | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: { new (): SpeechRecognition };
    webkitSpeechRecognition?: { new (): SpeechRecognition };
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Streaming speech-to-text using the browser Web Speech API (Chrome / Edge).
 * Emits stable phrases on `onFinalPhrase` when the engine marks a result final.
 */
export function useBrowserStt(options: {
  enabled: boolean;
  onFinalPhrase: (text: string) => void;
  /** When false, finals are ignored (e.g. while the agent is running). */
  allowDispatch?: boolean;
}) {
  const { enabled, onFinalPhrase, allowDispatch = true } = options;
  const onFinalRef = useRef(onFinalPhrase);
  const allowRef = useRef(allowDispatch);

  useEffect(() => {
    onFinalRef.current = onFinalPhrase;
    allowRef.current = allowDispatch;
  }, [onFinalPhrase, allowDispatch]);

  useEffect(() => {
    if (!enabled) return;

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      console.warn("[stt] Web Speech API not available in this browser");
      return;
    }

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (!res.isFinal) continue;
        const text = res[0]?.transcript?.trim() ?? "";
        if (!text) continue;
        if (!allowRef.current) continue;
        onFinalRef.current(text);
      }
    };

    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      if (ev.error === "aborted" || ev.error === "no-speech") return;
      console.warn("[stt]", ev.error);
    };

    try {
      rec.start();
    } catch {
      /* already started */
    }

    return () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      rec.onresult = null;
      rec.onerror = null;
    };
  }, [enabled]);
}
