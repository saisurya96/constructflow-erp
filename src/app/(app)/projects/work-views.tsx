"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  LayoutGrid,
  Table2,
  GanttChartSquare,
  Plus,
  MessageSquare,
  CheckSquare,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/app/field";
import { StatusBadge } from "@/components/app/status-badge";
import { ProgressMeter } from "@/components/app/meters";
import {
  TASK_STATUS_ORDER,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONE,
  TASK_PRIORITY_TONE,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_ORDER,
  type BadgeTone,
} from "@/lib/constants";
import type { ActionState } from "@/lib/forms";
import type { TaskStatus, TaskPriority } from "@/db/schema";
import {
  moveTask,
  setTaskPriority,
  setTaskAssignee,
  quickAddTask,
} from "./board-actions";
import { UpdateTaskDialog } from "./dialogs";
import { TaskDrawer } from "./task-drawer";
import type {
  BoardTask,
  Option,
  ChecklistItemView,
  TaskCommentView,
} from "./work-types";

/* ───────────────────────────── helpers ───────────────────────────── */

const DAY = 86_400_000;

function pdate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}
function todayMid(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function fmtShort(s: string | null): string {
  const d = pdate(s);
  return d ? d.toLocaleDateString("en", { day: "2-digit", month: "short" }) : "—";
}
function isOverdue(t: BoardTask): boolean {
  const d = pdate(t.dueDate);
  return !!d && t.status !== "done" && d.getTime() < todayMid().getTime();
}
function initials(name: string | null): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}
const TONE_DOT: Record<BadgeTone, string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  good: "bg-good",
  info: "bg-info",
  neutral: "bg-muted-foreground",
};

/* ───────────────────────────── main ───────────────────────────── */

export function WorkViews({
  projectId,
  tasks: tasksProp,
  wbsOptions,
  memberOptions,
  wbsLabelById,
  checklistByTask,
  commentsByTask,
  canSchedule,
}: {
  projectId: string;
  tasks: BoardTask[];
  wbsOptions: Option[];
  memberOptions: Option[];
  wbsLabelById: Record<string, string>;
  checklistByTask: Record<string, ChecklistItemView[]>;
  commentsByTask: Record<string, TaskCommentView[]>;
  canSchedule: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [view, setView] = useState<"board" | "table" | "timeline">("board");
  const [tasks, setTasks] = useState<BoardTask[]>(tasksProp);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);

  // Reconcile with server data after each revalidation (optimistic moves are
  // applied locally first, then this adopts the server's authoritative copy).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setTasks(tasksProp), [tasksProp]);

  function run(p: Promise<ActionState>, optimistic?: () => void, revert?: () => void) {
    optimistic?.();
    startTransition(async () => {
      const res = await p;
      if (res && !res.ok) {
        toast.error(res.error);
        revert?.();
      }
      router.refresh();
    });
  }

  function handleMove(taskId: string, status: TaskStatus) {
    const current = tasks.find((t) => t.id === taskId);
    if (!current || current.status === status) return;
    run(
      moveTask({ taskId, projectId, status }),
      () =>
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status,
                  isBlocked: status === "blocked",
                  progress:
                    status === "done" ? "100" : status === "not_started" ? "0" : t.progress,
                }
              : t,
          ),
        ),
      () => setTasks(tasksProp),
    );
  }

  const openTask = openId ? tasks.find((t) => t.id === openId) ?? null : null;
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of TASK_STATUS_ORDER) c[s] = 0;
    for (const t of tasks) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [tasks]);

  const VIEWS = [
    { key: "board", label: "Board", icon: LayoutGrid },
    { key: "table", label: "Table", icon: Table2 },
    { key: "timeline", label: "Timeline", icon: GanttChartSquare },
  ] as const;

  return (
    <div className="space-y-3">
      {/* view switcher */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border bg-card p-0.5">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[0.8rem] font-medium transition-colors",
                  view === v.key
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" /> {v.label}
              </button>
            );
          })}
        </div>
        <span className="hidden text-xs text-muted-foreground sm:block">
          {tasks.length} task{tasks.length === 1 ? "" : "s"}
        </span>
      </div>

      {view === "board" && (
        <BoardView
          tasks={tasks}
          counts={counts}
          canSchedule={canSchedule}
          projectId={projectId}
          dragId={dragId}
          overCol={overCol}
          onDragStart={(id) => setDragId(id)}
          onDragEnd={() => {
            setDragId(null);
            setOverCol(null);
          }}
          onColEnter={(s) => setOverCol(s)}
          onDrop={(id, s) => handleMove(id, s)}
          onOpen={(id) => setOpenId(id)}
          onQuickAdd={(name, status) => run(quickAddTask({ projectId, name, status }))}
        />
      )}

      {view === "table" && (
        <TableView
          tasks={tasks}
          memberOptions={memberOptions}
          canSchedule={canSchedule}
          onOpen={(id) => setOpenId(id)}
          onStatus={(id, s) => handleMove(id, s)}
          onPriority={(id, p) => run(setTaskPriority({ taskId: id, projectId, priority: p }))}
          onAssignee={(id, a) => run(setTaskAssignee({ taskId: id, projectId, assigneeId: a }))}
        />
      )}

      {view === "timeline" && <TimelineView tasks={tasks} onOpen={(id) => setOpenId(id)} />}

      <TaskDrawer
        task={openTask}
        open={openId !== null}
        onOpenChange={(o) => !o && setOpenId(null)}
        wbsLabel={openTask?.wbsId ? wbsLabelById[openTask.wbsId] ?? null : null}
        memberOptions={memberOptions}
        checklist={openTask ? checklistByTask[openTask.id] ?? [] : []}
        comments={openTask ? commentsByTask[openTask.id] ?? [] : []}
        projectId={projectId}
        canSchedule={canSchedule}
        editSlot={
          openTask ? (
            <UpdateTaskDialog
              task={{
                id: openTask.id,
                name: openTask.name,
                description: openTask.description,
                status: openTask.status,
                priority: openTask.priority,
                progress: openTask.progress,
                wbsId: openTask.wbsId,
                assigneeId: openTask.assigneeId,
                startDate: openTask.startDate,
                dueDate: openTask.dueDate,
                weight: openTask.weight,
              }}
              projectId={projectId}
              wbsOptions={wbsOptions}
              memberOptions={memberOptions}
            />
          ) : null
        }
      />
    </div>
  );
}

/* ───────────────────────────── card ───────────────────────────── */

function TaskCard({
  task,
  draggable,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  task: BoardTask;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const overdue = isOverdue(task);
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        "rounded-lg border bg-card p-2.5 text-left shadow-xs transition-shadow hover:shadow-sm",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
      )}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{task.name}</p>
        <span
          className={cn("mt-1 size-2 shrink-0 rounded-full", TONE_DOT[TASK_PRIORITY_TONE[task.priority]])}
          title={`${TASK_PRIORITY_LABELS[task.priority]} priority`}
        />
      </div>
      <ProgressMeter
        value={Number(task.progress)}
        tone={task.isBlocked ? "critical" : "info"}
        showLabel={false}
        className="mb-2"
      />
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {task.assigneeName ? (
            <span
              className="flex size-5 items-center justify-center rounded-full bg-foreground text-[0.55rem] font-semibold text-background"
              title={task.assigneeName}
            >
              {initials(task.assigneeName)}
            </span>
          ) : (
            <span className="flex size-5 items-center justify-center rounded-full border border-dashed text-[0.55rem]">
              ?
            </span>
          )}
          {task.dueDate && (
            <span className={cn("inline-flex items-center gap-0.5 tabular", overdue && "text-critical")}>
              <CalendarClock className="size-3" /> {fmtShort(task.dueDate)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {task.checklistTotal > 0 && (
            <span className="inline-flex items-center gap-0.5 tabular">
              <CheckSquare className="size-3" /> {task.checklistDone}/{task.checklistTotal}
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5 tabular">
              <MessageSquare className="size-3" /> {task.commentCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── board ───────────────────────────── */

function BoardView({
  tasks,
  counts,
  canSchedule,
  dragId,
  overCol,
  onDragStart,
  onDragEnd,
  onColEnter,
  onDrop,
  onOpen,
  onQuickAdd,
}: {
  tasks: BoardTask[];
  counts: Record<string, number>;
  canSchedule: boolean;
  projectId: string;
  dragId: string | null;
  overCol: TaskStatus | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onColEnter: (s: TaskStatus) => void;
  onDrop: (id: string, s: TaskStatus) => void;
  onOpen: (id: string) => void;
  onQuickAdd: (name: string, status: TaskStatus) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {TASK_STATUS_ORDER.map((status) => {
        const colTasks = tasks.filter((t) => t.status === status);
        return (
          <div
            key={status}
            onDragOver={(e) => {
              if (!canSchedule) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (overCol !== status) onColEnter(status);
            }}
            onDrop={(e) => {
              if (!canSchedule) return;
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain") || dragId;
              if (id) onDrop(id, status);
            }}
            className={cn(
              "flex flex-col rounded-xl border bg-muted/30 transition-colors",
              overCol === status && dragId && "border-brand bg-brand/5 ring-1 ring-brand/40",
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <div className="flex items-center gap-2">
                <StatusBadge tone={TASK_STATUS_TONE[status]}>{TASK_STATUS_LABELS[status]}</StatusBadge>
                <span className="text-xs tabular text-muted-foreground">{counts[status] ?? 0}</span>
              </div>
            </div>
            <div className="flex-1 space-y-2 p-2">
              {colTasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  draggable={canSchedule}
                  onDragStart={() => onDragStart(t.id)}
                  onDragEnd={onDragEnd}
                  onOpen={() => onOpen(t.id)}
                />
              ))}
              {colTasks.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                  {canSchedule ? "Drop tasks here" : "No tasks"}
                </p>
              )}
              {canSchedule && <QuickAdd onAdd={(name) => onQuickAdd(name, status)} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = useState("");
  const [active, setActive] = useState(false);
  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
      >
        <Plus className="size-3.5" /> Add task
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const name = value.trim();
        if (name.length >= 2) {
          onAdd(name);
          setValue("");
        }
      }}
    >
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        onBlur={() => !value && setActive(false)}
        placeholder="Task name, Enter to add"
        className="h-7 text-xs"
      />
    </form>
  );
}

/* ───────────────────────────── table ───────────────────────────── */

function TableView({
  tasks,
  memberOptions,
  canSchedule,
  onOpen,
  onStatus,
  onPriority,
  onAssignee,
}: {
  tasks: BoardTask[];
  memberOptions: Option[];
  canSchedule: boolean;
  onOpen: (id: string) => void;
  onStatus: (id: string, s: TaskStatus) => void;
  onPriority: (id: string, p: TaskPriority) => void;
  onAssignee: (id: string, a: string) => void;
}) {
  if (tasks.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No tasks yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">Task</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 font-medium">Priority</th>
            <th className="px-3 py-2.5 font-medium">Assignee</th>
            <th className="px-3 py-2.5 font-medium w-32">Progress</th>
            <th className="px-3 py-2.5 font-medium">Due</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40">
              <td className="px-3 py-2">
                <button type="button" onClick={() => onOpen(t.id)} className="text-left font-medium hover:underline">
                  {t.name}
                </button>
              </td>
              <td className="px-3 py-2">
                <NativeSelect
                  className="h-7 w-32 text-xs"
                  value={t.status}
                  disabled={!canSchedule}
                  onChange={(e) => onStatus(t.id, e.currentTarget.value as TaskStatus)}
                >
                  {TASK_STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {TASK_STATUS_LABELS[s]}
                    </option>
                  ))}
                </NativeSelect>
              </td>
              <td className="px-3 py-2">
                <NativeSelect
                  className="h-7 w-28 text-xs"
                  value={t.priority}
                  disabled={!canSchedule}
                  onChange={(e) => onPriority(t.id, e.currentTarget.value as TaskPriority)}
                >
                  {TASK_PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>
                      {TASK_PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </NativeSelect>
              </td>
              <td className="px-3 py-2">
                <NativeSelect
                  className="h-7 w-36 text-xs"
                  value={t.assigneeId ?? ""}
                  disabled={!canSchedule}
                  onChange={(e) => onAssignee(t.id, e.currentTarget.value)}
                >
                  <option value="">— unassigned —</option>
                  {memberOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              </td>
              <td className="px-3 py-2">
                <ProgressMeter value={Number(t.progress)} tone={t.isBlocked ? "critical" : "info"} />
              </td>
              <td className={cn("px-3 py-2 tabular", isOverdue(t) && "text-critical")}>{fmtShort(t.dueDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────────── timeline (gantt) ───────────────────────────── */

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function TimelineView({ tasks, onOpen }: { tasks: BoardTask[]; onOpen: (id: string) => void }) {
  const scheduled = tasks.filter((t) => pdate(t.startDate) || pdate(t.dueDate));

  if (scheduled.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Add start and due dates to tasks to see them on the timeline.
      </p>
    );
  }

  const allDates = scheduled.flatMap((t) => [pdate(t.startDate), pdate(t.dueDate)].filter(Boolean) as Date[]);
  const min = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const max = new Date(Math.max(...allDates.map((d) => d.getTime())));
  const domainStart = startOfMonth(min);
  const domainEnd = addMonths(startOfMonth(max), 1);
  const total = Math.max(domainEnd.getTime() - domainStart.getTime(), DAY);

  const ticks: { label: string; left: number }[] = [];
  for (let m = new Date(domainStart); m.getTime() < domainEnd.getTime(); m = addMonths(m, 1)) {
    ticks.push({
      label: m.toLocaleDateString("en", { month: "short", year: "2-digit" }),
      left: ((m.getTime() - domainStart.getTime()) / total) * 100,
    });
  }
  const today = todayMid();
  const todayLeft =
    today.getTime() >= domainStart.getTime() && today.getTime() <= domainEnd.getTime()
      ? ((today.getTime() - domainStart.getTime()) / total) * 100
      : null;

  const BAR_TONE: Record<string, string> = {
    not_started: "bg-muted-foreground/60",
    in_progress: "bg-info",
    blocked: "bg-critical",
    done: "bg-good",
  };

  return (
    <div className="overflow-x-auto rounded-xl border">
      <div className="min-w-[680px]">
        {/* header */}
        <div className="flex border-b bg-muted/30">
          <div className="w-48 shrink-0 border-r px-3 py-2 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Task
          </div>
          <div className="relative h-8 flex-1">
            {ticks.map((tk, i) => (
              <div
                key={i}
                className="absolute top-0 flex h-full items-center border-l pl-1 text-[0.6875rem] text-muted-foreground"
                style={{ left: `${tk.left}%` }}
              >
                {tk.label}
              </div>
            ))}
          </div>
        </div>
        {/* rows */}
        {scheduled.map((t) => {
          const s = pdate(t.startDate) ?? pdate(t.dueDate)!;
          const e = pdate(t.dueDate) ?? pdate(t.startDate)!;
          const startMs = Math.min(s.getTime(), e.getTime());
          const endMs = Math.max(s.getTime(), e.getTime());
          const left = ((startMs - domainStart.getTime()) / total) * 100;
          const width = Math.max(((endMs - startMs) / total) * 100, 1.5);
          return (
            <div key={t.id} className="flex border-b last:border-0 hover:bg-muted/30">
              <button
                type="button"
                onClick={() => onOpen(t.id)}
                className="w-48 shrink-0 truncate border-r px-3 py-2 text-left text-xs font-medium hover:underline"
                title={t.name}
              >
                {t.name}
              </button>
              <div className="relative h-9 flex-1">
                {ticks.map((tk, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full border-l border-border/50"
                    style={{ left: `${tk.left}%` }}
                  />
                ))}
                {todayLeft !== null && (
                  <div className="absolute top-0 z-10 h-full border-l-2 border-brand/70" style={{ left: `${todayLeft}%` }} />
                )}
                <button
                  type="button"
                  onClick={() => onOpen(t.id)}
                  className={cn(
                    "absolute top-1/2 flex h-4 -translate-y-1/2 items-center overflow-hidden rounded px-1 text-[0.6rem] font-medium text-white/95",
                    BAR_TONE[t.status],
                  )}
                  style={{ left: `${Math.max(0, Math.min(left, 100))}%`, width: `${Math.min(width, 100)}%` }}
                  title={`${fmtShort(t.startDate)} → ${fmtShort(t.dueDate)}`}
                >
                  <span className="truncate">{Math.round(Number(t.progress))}%</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
