"use client";

import { use } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const Board = dynamic(
  () => import("@/components/canvas/Board").then((m) => m.Board),
  { ssr: false }
);

export default function BoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <svg
              className="mr-1 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium">Stormy</h1>
          <span className="text-xs text-muted-foreground">Board</span>
        </div>
      </header>
      <div className="flex-1">
        <Board boardId={id} />
      </div>
    </div>
  );
}
