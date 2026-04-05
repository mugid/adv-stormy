"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import { BoardCard } from "@/components/dashboard/BoardCard";
import { CreateBoardDialog } from "@/components/dashboard/CreateBoardDialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

interface Board {
  id: string;
  title: string;
  updatedAt: string;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBoards();
  }, []);

  async function fetchBoards() {
    try {
      const res = await fetch("/api/boards");
      if (res.ok) {
        const data = await res.json();
        setBoards(data);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/boards?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setBoards((prev) => prev.filter((b) => b.id !== id));
    }
  }

  const initials =
    session?.user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "?";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Stormy</h1>
          </div>
          <div className="flex items-center gap-4">
            <CreateBoardDialog />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" className="rounded-full" />}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-muted-foreground" disabled>
                  {session?.user?.email}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => signOut({ fetchOptions: { onSuccess: () => window.location.reload() } })}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <h2 className="mb-6 text-lg font-medium">Your Boards</h2>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-4/3 rounded-lg" />
            ))}
          </div>
        ) : boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
            <svg
              className="mb-4 h-12 w-12 text-muted-foreground/40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <h3 className="mb-1 text-lg font-medium">No boards yet</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Create your first brainstorming board to get started
            </p>
            <CreateBoardDialog />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {boards.map((board) => (
              <BoardCard
                key={board.id}
                id={board.id}
                title={board.title}
                updatedAt={board.updatedAt}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
