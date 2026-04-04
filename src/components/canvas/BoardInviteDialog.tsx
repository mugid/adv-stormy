"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type BoardMemberRow = {
  id: string;
  userId: string;
  role: string;
  email: string;
  name: string;
};

type BoardInviteDialogProps = {
  boardId: string;
};

export function BoardInviteDialog({ boardId }: BoardInviteDialogProps) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<BoardMemberRow[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviteBusy, setInviteBusy] = useState(false);

  const loadMembers = useCallback(async () => {
    setListBusy(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/members`);
      const data = (await res.json()) as {
        members?: BoardMemberRow[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Could not load members");
      }
      setMembers(data.members ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load members");
      setMembers([]);
    } finally {
      setListBusy(false);
    }
  }, [boardId]);

  useEffect(() => {
    if (!open) return;
    void loadMembers();
  }, [open, loadMembers]);

  const onInvite = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      toast.error("Enter an email address");
      return;
    }
    setInviteBusy(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, role: inviteRole }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Invite failed");
      }
      toast.success(
        res.status === 201 ? "Member added" : "Role updated for member",
      );
      setEmail("");
      await loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviteBusy(false);
    }
  };

  const removeMember = async (userId: string) => {
    try {
      const res = await fetch(
        `/api/boards/${boardId}/members?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Remove failed");
      }
      toast.success("Removed from board");
      await loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    }
  };

  const changeRole = async (m: BoardMemberRow, role: "editor" | "viewer") => {
    if (m.role === role) return;
    try {
      const res = await fetch(`/api/boards/${boardId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: m.email.trim().toLowerCase(), role }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Update failed");
      }
      toast.success("Role updated");
      await loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 border-border bg-background/90 text-xs shadow-sm backdrop-blur-sm"
        onClick={() => setOpen(true)}
      >
        <UserPlus className="h-3.5 w-3.5" />
        Share
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-md"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>Share board</DialogTitle>
            <DialogDescription>
              Invite people who already have an account. They must sign up with
              the same email you enter here.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onInvite} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                disabled={inviteBusy}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">Access</Label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(ev) =>
                  setInviteRole(ev.target.value === "viewer" ? "viewer" : "editor")
                }
                disabled={inviteBusy}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
            </div>
            <Button type="submit" disabled={inviteBusy} size="sm" className="w-full sm:w-auto">
              {inviteBusy ? "Saving…" : "Add or update member"}
            </Button>
          </form>

          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              People with access
            </p>
            {listBusy ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : members.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No members yet. Only you (owner) can open this board until you
                add someone.
              </p>
            ) : (
              <ul className="max-h-48 space-y-2 overflow-y-auto pr-1">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {m.name || m.email}
                    </span>
                    <select
                      value={m.role === "viewer" ? "viewer" : "editor"}
                      onChange={(ev) =>
                        changeRole(
                          m,
                          ev.target.value === "viewer" ? "viewer" : "editor",
                        )
                      }
                      className="h-7 max-w-[7.5rem] rounded-md border border-input bg-background px-1.5 text-[0.7rem] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      aria-label={`Role for ${m.email}`}
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void removeMember(m.userId)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
