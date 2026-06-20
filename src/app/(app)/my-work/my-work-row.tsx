"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { NativeSelect } from "@/components/app/field";
import { StatusBadge } from "@/components/app/status-badge";
import {
  TASK_STATUS_ORDER,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONE,
  TASK_PRIORITY_TONE,
  TASK_PRIORITY_LABELS,
} from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { moveTask } from "../projects/board-actions";
import type { TaskStatus, TaskPriority } from "@/db/schema";

export type MyTask = {
  id: string;
  name: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  projectId: string;
  projectName: string;
  projectCode: string;
  overdue: boolean;
};

export function MyTaskRow({
  task,
  canSchedule,
  canViewProject,
}: {
  task: MyTask;
  canSchedule: boolean;
  /** Stores/buyers can be assigned tasks but can't open the project page — show
   *  the task name as plain text for them rather than a link to /forbidden. */
  canViewProject: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onStatus(status: TaskStatus) {
    startTransition(async () => {
      const res = await moveTask({ taskId: task.id, projectId: task.projectId, status });
      if (res && !res.ok) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        {canViewProject ? (
          <Link href={`/projects/${task.projectId}`} className="text-sm font-medium hover:underline">
            {task.name}
          </Link>
        ) : (
          <span className="text-sm font-medium">{task.name}</span>
        )}
        <p className="truncate text-xs text-muted-foreground">
          {task.projectCode} · {task.projectName}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge tone={TASK_PRIORITY_TONE[task.priority]}>
          {TASK_PRIORITY_LABELS[task.priority]}
        </StatusBadge>
        <span className={`w-20 text-right text-xs tabular ${task.overdue ? "text-critical" : "text-muted-foreground"}`}>
          {formatDate(task.dueDate)}
        </span>
        {canSchedule ? (
          <NativeSelect
            className="h-7 w-32 text-xs"
            value={task.status}
            disabled={pending}
            onChange={(e) => onStatus(e.currentTarget.value as TaskStatus)}
          >
            {TASK_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <StatusBadge tone={TASK_STATUS_TONE[task.status]}>{TASK_STATUS_LABELS[task.status]}</StatusBadge>
        )}
      </div>
    </div>
  );
}
