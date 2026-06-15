import type { TaskStatus, TaskPriority } from "@/db/schema";

export type Option = { id: string; label: string };

/** A task as rendered on the board / table / timeline / drawer. */
export type BoardTask = {
  id: string;
  name: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  progress: string;
  startDate: string | null;
  dueDate: string | null;
  isBlocked: boolean;
  wbsId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  weight: string;
  checklistTotal: number;
  checklistDone: number;
  commentCount: number;
};

export type ChecklistItemView = { id: string; title: string; isDone: boolean };
export type TaskCommentView = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
};
