"use client";

import { useActionState } from "react";
import { Plus, Pencil, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/app/form-dialog";
import { Field, DateField, NativeSelect } from "@/components/app/field";
import { UNITS } from "@/lib/constants";
import {
  createProject,
  createTask,
  updateTask,
  createMilestone,
  createWbsCode,
  createChangeOrder,
  updateProjectStatus,
} from "./actions";
import { raiseRequirement } from "../requirements/actions";

type Option = { id: string; label: string };

export function ProjectStatusControl({
  projectId,
  status,
}: {
  projectId: string;
  status: string;
}) {
  const [, formAction] = useActionState(updateProjectStatus, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <NativeSelect
        name="status"
        defaultValue={status}
        className="h-8 w-40 text-xs"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="planning">Planning</option>
        <option value="active">Active</option>
        <option value="on_hold">On hold</option>
        <option value="completed">Completed</option>
        <option value="archived">Archived</option>
      </NativeSelect>
    </form>
  );
}

export function CreateProjectDialog() {
  return (
    <FormDialog
      title="New project"
      description="A phase-based WBS is created automatically; edit it on the Budget tab."
      action={createProject}
      submitLabel="Create project"
      trigger={
        <Button size="sm">
          <Plus className="size-4" /> New project
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <Field label="Project name" htmlFor="name" required error={errors.name}>
            <Input id="name" name="name" placeholder="Marina Heights Tower" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Client" htmlFor="clientName" error={errors.clientName}>
              <Input id="clientName" name="clientName" placeholder="Client name" />
            </Field>
            <Field label="Location" htmlFor="location" error={errors.location}>
              <Input id="location" name="location" placeholder="City / area" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Budget (cost)" htmlFor="budget" error={errors.budget}>
              <Input id="budget" name="budget" type="number" step="0.01" min="0" defaultValue="0" />
            </Field>
            <Field label="Contract value" htmlFor="contractValue" error={errors.contractValue}>
              <Input id="contractValue" name="contractValue" type="number" step="0.01" min="0" defaultValue="0" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" htmlFor="startDate" error={errors.startDate}>
              <DateField name="startDate" />
            </Field>
            <Field label="Target completion" htmlFor="endDate" error={errors.endDate}>
              <DateField name="endDate" />
            </Field>
          </div>
          <Field label="Description" htmlFor="description">
            <Textarea id="description" name="description" rows={2} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function AddTaskDialog({
  projectId,
  wbsOptions,
  memberOptions,
}: {
  projectId: string;
  wbsOptions: Option[];
  memberOptions: Option[];
}) {
  return (
    <FormDialog
      title="Add task"
      action={createTask}
      submitLabel="Add task"
      trigger={
        <Button size="sm" variant="outline">
          <Plus className="size-4" /> Add task
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="Task name" htmlFor="name" required error={errors.name}>
            <Input id="name" name="name" required placeholder="Raft foundation pour" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cost code (WBS)" htmlFor="wbsId">
              <NativeSelect id="wbsId" name="wbsId" defaultValue="">
                <option value="">— none —</option>
                {wbsOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Assignee" htmlFor="assigneeId">
              <NativeSelect id="assigneeId" name="assigneeId" defaultValue="">
                <option value="">— unassigned —</option>
                {memberOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" htmlFor="startDate">
              <DateField name="startDate" />
            </Field>
            <Field label="Due date" htmlFor="dueDate">
              <DateField name="dueDate" />
            </Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function UpdateTaskDialog({
  task,
  projectId,
}: {
  task: { id: string; name: string; status: string; progress: string };
  projectId: string;
}) {
  return (
    <FormDialog
      title={`Update: ${task.name}`}
      action={updateTask}
      submitLabel="Save"
      trigger={
        <Button size="xs" variant="ghost">
          <Pencil className="size-3.5" /> Update
        </Button>
      }
    >
      <input type="hidden" name="taskId" value={task.id} />
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="Status" htmlFor="status">
        <NativeSelect id="status" name="status" defaultValue={task.status}>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="blocked">Blocked</option>
          <option value="done">Done</option>
        </NativeSelect>
      </Field>
      <Field label="Progress %" htmlFor="progress">
        <Input
          id="progress"
          name="progress"
          type="number"
          min="0"
          max="100"
          defaultValue={String(Math.round(Number(task.progress)))}
        />
      </Field>
    </FormDialog>
  );
}

export function AddMilestoneDialog({ projectId }: { projectId: string }) {
  return (
    <FormDialog
      title="Add milestone"
      action={createMilestone}
      submitLabel="Add milestone"
      trigger={
        <Button size="sm" variant="outline">
          <Plus className="size-4" /> Add milestone
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="Milestone name" htmlFor="name" required error={errors.name}>
            <Input id="name" name="name" required placeholder="Foundation complete" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date" htmlFor="dueDate">
              <DateField name="dueDate" />
            </Field>
            <Field label="Billing amount" htmlFor="billingAmount" error={errors.billingAmount}>
              <Input id="billingAmount" name="billingAmount" type="number" step="0.01" min="0" defaultValue="0" />
            </Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function AddWbsDialog({ projectId }: { projectId: string }) {
  return (
    <FormDialog
      title="Add cost code"
      action={createWbsCode}
      submitLabel="Add code"
      trigger={
        <Button size="sm" variant="outline">
          <Plus className="size-4" /> Add cost code
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="Code" htmlFor="code" required error={errors.code}>
              <Input id="code" name="code" required placeholder="9.0" />
            </Field>
            <Field label="Name" htmlFor="name" required error={errors.name} className="col-span-2">
              <Input id="name" name="name" required placeholder="Specialist works" />
            </Field>
          </div>
          <Field label="Budget" htmlFor="budget" error={errors.budget}>
            <Input id="budget" name="budget" type="number" step="0.01" min="0" defaultValue="0" />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function AddChangeOrderDialog({ projectId }: { projectId: string }) {
  return (
    <FormDialog
      title="New change order"
      action={createChangeOrder}
      submitLabel="Create"
      trigger={
        <Button size="sm" variant="outline">
          <Plus className="size-4" /> New change order
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="Title" htmlFor="title" required error={errors.title}>
            <Input id="title" name="title" required placeholder="Additional waterproofing" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cost impact" htmlFor="costImpact" error={errors.costImpact}>
              <Input id="costImpact" name="costImpact" type="number" step="0.01" defaultValue="0" />
            </Field>
            <Field label="Revenue impact" htmlFor="revenueImpact" error={errors.revenueImpact}>
              <Input id="revenueImpact" name="revenueImpact" type="number" step="0.01" defaultValue="0" />
            </Field>
          </div>
          <Field label="Schedule impact (days)" htmlFor="scheduleImpactDays">
            <Input id="scheduleImpactDays" name="scheduleImpactDays" type="number" defaultValue="0" />
          </Field>
          <Field label="Reason / description" htmlFor="description">
            <Textarea id="description" name="description" rows={2} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function RaiseRequirementDialog({
  projectId,
  taskOptions,
  wbsOptions,
  variant = "outline",
}: {
  projectId: string;
  taskOptions: Option[];
  wbsOptions: Option[];
  variant?: "default" | "outline";
}) {
  return (
    <FormDialog
      title="Raise material requirement"
      description="Flags the linked task until the material is covered."
      action={raiseRequirement}
      submitLabel="Raise requirement"
      trigger={
        <Button size="sm" variant={variant}>
          <Boxes className="size-4" /> Raise requirement
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="Item" htmlFor="itemName" required error={errors.itemName}>
            <Input id="itemName" name="itemName" required placeholder="Reinforcement steel Y16" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Quantity" htmlFor="quantity" required error={errors.quantity}>
              <Input id="quantity" name="quantity" type="number" step="0.001" min="0" required />
            </Field>
            <Field label="Unit" htmlFor="unit" required error={errors.unit}>
              <NativeSelect id="unit" name="unit" defaultValue="pcs">
                {UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Est. unit cost" htmlFor="estimatedUnitCost" error={errors.estimatedUnitCost}>
              <Input id="estimatedUnitCost" name="estimatedUnitCost" type="number" step="0.01" min="0" defaultValue="0" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="For task" htmlFor="taskId">
              <NativeSelect id="taskId" name="taskId" defaultValue="">
                <option value="">— none —</option>
                {taskOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Cost code" htmlFor="wbsId">
              <NativeSelect id="wbsId" name="wbsId" defaultValue="">
                <option value="">— none —</option>
                {wbsOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Needed by" htmlFor="neededBy">
            <DateField name="neededBy" />
          </Field>
        </>
      )}
    </FormDialog>
  );
}
