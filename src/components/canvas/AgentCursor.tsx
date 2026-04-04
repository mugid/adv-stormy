"use client";

import { useEffect, useState } from "react";

interface AgentCursorProps {
  x: number;
  y: number;
  visible: boolean;
  label?: string;
}

export function AgentCursor({
  x,
  y,
  visible,
  label = "AI Agent",
}: AgentCursorProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
    });
  }, []);

  if (!mounted || !visible) return null;

  return (
    <div
      className="pointer-events-none absolute z-50 transition-all duration-300 ease-out"
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      <svg
        width="16"
        height="20"
        viewBox="0 0 16 20"
        fill="none"
        className="drop-shadow-md"
      >
        <path
          d="M0.928711 0.857178L15.0716 8.28575L8.07159 10.2857L4.5001 18.5714L0.928711 0.857178Z"
          fill="#8B5CF6"
          stroke="#7C3AED"
          strokeWidth="1"
        />
      </svg>
      <span className="ml-4 -mt-1 inline-block whitespace-nowrap rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm">
        {label}
      </span>
    </div>
  );
}
