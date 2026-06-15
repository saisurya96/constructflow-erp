"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Trash2, Plus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/app/field";
import { StatusBadge } from "@/components/app/status-badge";
import {
  TASK_STATUS_TONE,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_TONE,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_ORDER,
} from "@/lib/constants";
import type { ActionState } from "@/lib/forms";
import type { TaskStatus, TaskPriority } from "@/db/schema";
import {
  moveTask,
  setTaskPriority,
  setTaskAssignee,
  addChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  addTaskComment,
} from "./board-actions";
import type {
  BoardTask,
  Option,
  ChecklistItemView,
  TaskCommentView,
} from "./work-types";

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s + "T00:00:00");
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function TaskDrawer({
  task,
  open,
  onOpenChange,
  wbsLabel,
  memberOptions,
  checklist,
  comments,
  projectId,
  canSchedule,
  editSlot,
}: {
  task: BoardTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wbsLabel: string | null;
  memberOptions: Option[];
  checklist: ChecklistItemView[];
  comments: TaskCommentView[];
  projectId: string;
  canSchedule: boolean;
  editSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [newItem, setNewItem] = useState("");
  const [comment, setComment] = useState("");

  function run(p: Promise<ActionState>) {
    startTransition(async () => {
      const res = await p;
      if (res && !res.ok) toast.error(res.error);
      else router.refresh();
    });
  }

  if (!task) return null;

  const doneCount = checklist.filter((c) => c.isDone).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <StatusBadge tone={TASK_STATUS_TONE[task.status]}>
              {TASK_STATUS_LABELS[task.status]}
            </StatusBadge>
            <StatusBadge tone={TASK_PRIORITY_TONE[task.priority]}>
              {TASK_PRIORITY_LABELS[task.priority]}
            </StatusBadge>
          </div>
          <SheetTitle className="pr-8 text-base leading-snug">{task.name}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          {!canSchedule && (
            <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
              View only — ask a project manager to update this task.
            </p>
          )}
          {/* quick controls */}
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="eyebrow text-muted-foreground">Status</span>
              <NativeSelect
                className="h-8 text-xs"
                value={task.status}
                disabled={!canSchedule}
                onChange={(e) =>
                  run(moveTask({ taskId: task.id, projectId, status: e.currentTarget.value as TaskStatus }))
                }
              >
                {TASK_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="space-y-1">
              <span className="eyebrow text-muted-foreground">Priority</span>
              <NativeSelect
                className="h-8 text-xs"
                value={task.priority}
                disabled={!canSchedule}
                onChange={(e) =>
                  run(setTaskPriority({ taskId: task.id, projectId, priority: e.currentTarget.value as TaskPriority }))
                }
              >
                {TASK_PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="space-y-1 col-span-2">
              <span className="eyebrow text-muted-foreground">Assignee</span>
              <NativeSelect
                className="h-8 text-xs"
                value={task.assigneeId ?? ""}
                disabled={!canSchedule}
                onChange={(e) =>
                  run(setTaskAssignee({ taskId: task.id, projectId, assigneeId: e.currentTarget.value }))
                }
              >
                <option value="">— unassigned —</option>
                {memberOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>

          {/* meta */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Start</dt>
              <dd className="tabular">{fmtDate(task.startDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Due</dt>
              <dd className="tabular">{fmtDate(task.dueDate)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">Cost code</dt>
              <dd>{wbsLabel ?? "—"}</dd>
            </div>
          </dl>

          {task.description && (
            <div>
              <p className="eyebrow mb-1 text-muted-foreground">Description</p>
              <p className="whitespace-pre-wrap text-sm text-foreground/90">{task.description}</p>
            </div>
          )}

          {/* checklist */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="eyebrow text-muted-foreground">Checklist</p>
              {checklist.length > 0 && (
                <span className="text-xs tabular text-muted-foreground">
                  {doneCount}/{checklist.length}
                </span>
              )}
            </div>
            <div className="space-y-1">
              {checklist.map((c) => (
                <div key={c.id} className="group flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={c.isDone}
                    disabled={!canSchedule}
                    onChange={(e) =>
                      run(toggleChecklistItem({ itemId: c.id, projectId, isDone: e.currentTarget.checked }))
                    }
                    className="size-3.5 shrink-0 accent-brand disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span className={`flex-1 text-sm ${c.isDone ? "text-muted-foreground line-through" : ""}`}>
                    {c.title}
                  </span>
                  {canSchedule && (
                    <button
                      type="button"
                      aria-label="Remove item"
                      onClick={() => run(deleteChecklistItem({ itemId: c.id, projectId }))}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5 text-muted-foreground hover:text-critical" />
                    </button>
                  )}
                </div>
              ))}
              {checklist.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">No items yet.</p>
              )}
            </div>
            {canSchedule && (
              <form
                className="mt-1.5 flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const title = newItem.trim();
                  if (!title) return;
                  setNewItem("");
                  run(addChecklistItem({ taskId: task.id, projectId, title }));
                }}
              >
                <Input
                  value={newItem}
                  onChange={(e) => setNewItem(e.currentTarget.value)}
                  placeholder="Add an item…"
                  className="h-7 text-xs"
                />
                <Button type="submit" size="icon-sm" variant="outline" aria-label="Add checklist item">
                  <Plus className="size-3.5" />
                </Button>
              </form>
            )}
          </div>

          {/* comments / activity */}
          <div>
            <p className="eyebrow mb-1.5 text-muted-foreground">Activity</p>
            <div className="space-y-2.5">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[0.6rem] font-semibold text-background">
                    {c.authorName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs">
                      <span className="font-medium">{c.authorName}</span>{" "}
                      <span className="text-muted-foreground">{fmtWhen(c.createdAt)}</span>
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-foreground/90">{c.body}</p>
                  </div>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-xs text-muted-foreground">No activity yet.</p>
              )}
            </div>
            {canSchedule && (
              <form
                className="mt-2 flex items-end gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const body = comment.trim();
                  if (!body) return;
                  setComment("");
                  run(addTaskComment({ taskId: task.id, projectId, body }));
                }}
              >
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.currentTarget.value)}
                  rows={2}
                  placeholder="Write a comment…"
                  className="text-sm"
                />
                <Button type="submit" size="icon-sm" variant="outline" aria-label="Post comment">
                  <Send className="size-3.5" />
                </Button>
              </form>
            )}
          </div>

          {canSchedule && editSlot && <div className="border-t pt-3">{editSlot}</div>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
