/** LiveKit room name for a board (stable, URL-safe). */
export function livekitRoomNameForBoard(boardId: string): string {
  return `board-${boardId}`;
}
