import { db } from "@/lib/db";
import { boardMembers, boards } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export type BoardAccessRole = "owner" | "editor" | "viewer";

export type BoardAccess = {
  board: typeof boards.$inferSelect;
  role: BoardAccessRole;
  canEdit: boolean;
};

/**
 * Resolve board row + caller role. Null if user has no access.
 */
export async function getBoardAccess(
  boardId: string,
  userId: string
): Promise<BoardAccess | null> {
  const [board] = await db.select().from(boards).where(eq(boards.id, boardId));
  if (!board) return null;

  if (board.ownerId === userId) {
    return { board, role: "owner", canEdit: true };
  }

  const [member] = await db
    .select()
    .from(boardMembers)
    .where(
      and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId))
    );

  if (!member) return null;

  const canEdit = member.role === "editor";
  return {
    board,
    role: member.role,
    canEdit,
  };
}
