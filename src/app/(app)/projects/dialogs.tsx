"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/app/form-dialog";
import { Field, DateField, NativeSelect } from "@/components/app/field";
import { UNITS } from "@/lib/constants";
import {
  createProject,
  updateProject,
  createTask,
  updateTask,
  createMilestone,
  updateMilestone,
  createWbsCode,
  updateWbsCode,
  createChangeOrder,
  updateProjectStatus,
} from "./actions";
import { raiseRequirement, updateRequirement } from "../requirements/actions";

type Option = { id: string; label: string };

type ProjectDefaults = {
  id: string;
  name: string;
  clientName: string | null;
  location: string | null;
  contractValue: string;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
};

export function ProjectStatusControl({
  projectId,
  status,
}: {
  projectId: string;
  status: string;
}) {
  const [state, formAction] = useActionState(updateProjectStatus, null);
  // Controlled value so the dropdown reflects the persisted status. An
  // uncontrolled <select defaultValue> keeps its initial DOM value across
  // revalidation, so after a successful change it would snap back to the old
  // status (looking like the save failed). Adopt the server value when the
  // prop updates, and roll back to it if the action errors.
  const [value, setValue] = useState(status);
  useEffect(() => setValue(status), [status]);
  useEffect(() => {
    if (state && !state.ok) {
      toast.error(state.error);
      setValue(status);
    }
  }, [state, status]);
  return (
    <form action={formAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <NativeSelect
        name="status"
        value={value}
        className="h-8 w-40 text-xs"
        onChange={(e) => {
          setValue(e.currentTarget.value);
          e.currentTarget.form?.requestSubmit();
        }}
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

function ProjectFields({
  errors,
  defaults,
}: {
  errors: Record<string, string>;
  defaults?: ProjectDefaults;
}) {
  return (
    <>
      <Field label="Project name" htmlFor="name" required error={errors.name}>
        <Input id="name" name="name" placeholder="Marina Heights Tower" defaultValue={defaults?.name ?? ""} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client" htmlFor="clientName" error={errors.clientName}>
          <Input id="clientName" name="clientName" placeholder="Client name" defaultValue={defaults?.clientName ?? ""} />
        </Field>
        <Field label="Location" htmlFor="location" error={errors.location}>
          <Input id="location" name="location" placeholder="City / area" defaultValue={defaults?.location ?? ""} />
        </Field>
      </div>
      <Field label="Contract value" htmlFor="contractValue" error={errors.contractValue}>
        <Input
          id="contractValue"
          name="contractValue"
          type="number"
          step="0.01"
          min="0"
          defaultValue={defaults?.contractValue ?? "0"}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Set the cost budget per cost code on the Budget tab{defaults ? "" : " after the project is created"}.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" htmlFor="startDate" error={errors.startDate}>
          <DateField name="startDate" defaultValue={defaults?.startDate ?? undefined} />
        </Field>
        <Field label="Target completion" htmlFor="endDate" error={errors.endDate}>
          <DateField name="endDate" defaultValue={defaults?.endDate ?? undefined} />
        </Field>
      </div>
      <Field label="Description" htmlFor="description">
        <Textarea id="description" name="description" rows={2} defaultValue={defaults?.description ?? ""} />
      </Field>
    </>
  );
}

export function CreateProjectDialog() {
  return (
    <FormDialog
      title="New project"
      description="A phase-based WBS is created automatically; set budgets on the Budget tab."
      action={createProject}
      submitLabel="Create project"
      className="sm:max-w-lg"
      trigger={
        <Button size="sm">
          <Plus className="size-4" /> New project
        </Button>
      }
    >
      {({ errors }) => <ProjectFields errors={errors} />}
    </FormDialog>
  );
}

export function EditProjectDialog({ project }: { project: ProjectDefaults }) {
  return (
    <FormDialog
      title="Edit project"
      description="Update the contract value, client, dates or description."
      action={updateProject}
      submitLabel="Save changes"
      className="sm:max-w-lg"
      trigger={
        <Button size="sm" variant="outline">
          <Pencil className="size-3.5" /> Edit
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="projectId" value={project.id} />
          <ProjectFields errors={errors} defaults={project} />
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
  wbsOptions,
  memberOptions,
}: {
  task: {
    id: string;
    name: string;
    status: string;
    progress: string;
    wbsId: string | null;
    assigneeId: string | null;
    startDate: string | null;
    dueDate: string | null;
    weight: string;
  };
  projectId: string;
  wbsOptions: Option[];
  memberOptions: Option[];
}) {
  return (
    <FormDialog
      title={`Update: ${task.name}`}
      action={updateTask}
      submitLabel="Save"
      className="sm:max-w-lg"
      trigger={
        <Button size="xs" variant="ghost">
          <Pencil className="size-3.5" /> Update
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="Task name" htmlFor="name" required error={errors.name}>
            <Input id="name" name="name" required defaultValue={task.name} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cost code (WBS)" htmlFor="wbsId">
              <NativeSelect id="wbsId" name="wbsId" defaultValue={task.wbsId ?? ""}>
                <option value="">— none —</option>
                {wbsOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Assignee" htmlFor="assigneeId">
              <NativeSelect id="assigneeId" name="assigneeId" defaultValue={task.assigneeId ?? ""}>
                <option value="">— unassigned —</option>
                {memberOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Start date" htmlFor="startDate">
              <DateField name="startDate" defaultValue={task.startDate ?? undefined} />
            </Field>
            <Field label="Due date" htmlFor="dueDate">
              <DateField name="dueDate" defaultValue={task.dueDate ?? undefined} />
            </Field>
            <Field label="Weight" htmlFor="weight" hint="Progress weighting" error={errors.weight}>
              <Input
                id="weight"
                name="weight"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={String(Number(task.weight))}
              />
            </Field>
          </div>
        </>
      )}
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

export function EditMilestoneDialog({
  projectId,
  milestone,
}: {
  projectId: string;
  milestone: { id: string; name: string; dueDate: string | null; billingAmount: string };
}) {
  return (
    <FormDialog
      title={`Edit milestone`}
      action={updateMilestone}
      submitLabel="Save"
      trigger={
        <Button size="xs" variant="ghost">
          <Pencil className="size-3.5" /> Edit
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="milestoneId" value={milestone.id} />
          <Field label="Milestone name" htmlFor="name" required error={errors.name}>
            <Input id="name" name="name" required defaultValue={milestone.name} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date" htmlFor="dueDate">
              <DateField name="dueDate" defaultValue={milestone.dueDate ?? undefined} />
            </Field>
            <Field label="Billing amount" htmlFor="billingAmount" error={errors.billingAmount}>
              <Input
                id="billingAmount"
                name="billingAmount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={String(Number(milestone.billingAmount))}
              />
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

export function EditWbsDialog({
  projectId,
  wbs,
}: {
  projectId: string;
  wbs: { id: string; code: string; name: string; budget: string };
}) {
  return (
    <FormDialog
      title={`Edit cost code ${wbs.code}`}
      action={updateWbsCode}
      submitLabel="Save"
      trigger={
        <Button size="xs" variant="ghost">
          <Pencil className="size-3.5" /> Edit
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="wbsId" value={wbs.id} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="Code" htmlFor="code" required error={errors.code}>
              <Input id="code" name="code" required defaultValue={wbs.code} />
            </Field>
            <Field label="Name" htmlFor="name" required error={errors.name} className="col-span-2">
              <Input id="name" name="name" required defaultValue={wbs.name} />
            </Field>
          </div>
          <Field label="Budget" htmlFor="budget" error={errors.budget}>
            <Input
              id="budget"
              name="budget"
              type="number"
              step="0.01"
              min="0"
              defaultValue={String(Number(wbs.budget))}
            />
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
          <p className="text-xs text-muted-foreground">
            Use a negative value for omissions / deductive variations or client credits.
          </p>
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

type RequirementDefaults = {
  id: string;
  itemName: string;
  unit: string;
  quantity: string;
  estimatedUnitCost: string;
  neededBy: string | null;
  taskId: string | null;
  wbsId: string | null;
  description: string | null;
};

function RequirementFields({
  errors,
  taskOptions,
  wbsOptions,
  defaults,
}: {
  errors: Record<string, string>;
  taskOptions: Option[];
  wbsOptions: Option[];
  defaults?: RequirementDefaults;
}) {
  return (
    <>
      <Field label="Item" htmlFor="itemName" required error={errors.itemName}>
        <Input id="itemName" name="itemName" required placeholder="Reinforcement steel Y16" defaultValue={defaults?.itemName ?? ""} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Quantity" htmlFor="quantity" required error={errors.quantity}>
          <Input id="quantity" name="quantity" type="number" step="0.001" min="0" required defaultValue={defaults ? String(Number(defaults.quantity)) : ""} />
        </Field>
        <Field label="Unit" htmlFor="unit" required error={errors.unit}>
          <NativeSelect id="unit" name="unit" defaultValue={defaults?.unit ?? "pcs"}>
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Est. unit cost" htmlFor="estimatedUnitCost" error={errors.estimatedUnitCost}>
          <Input id="estimatedUnitCost" name="estimatedUnitCost" type="number" step="0.01" min="0" defaultValue={defaults ? String(Number(defaults.estimatedUnitCost)) : "0"} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="For task" htmlFor="taskId">
          <NativeSelect id="taskId" name="taskId" defaultValue={defaults?.taskId ?? ""}>
            <option value="">— none —</option>
            {taskOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Cost code" htmlFor="wbsId">
          <NativeSelect id="wbsId" name="wbsId" defaultValue={defaults?.wbsId ?? ""}>
            <option value="">— none —</option>
            {wbsOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Needed by" htmlFor="neededBy">
        <DateField name="neededBy" defaultValue={defaults?.neededBy ?? undefined} />
      </Field>
    </>
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
      className="sm:max-w-lg"
      trigger={
        <Button size="sm" variant={variant}>
          <Boxes className="size-4" /> Raise requirement
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <RequirementFields errors={errors} taskOptions={taskOptions} wbsOptions={wbsOptions} />
        </>
      )}
    </FormDialog>
  );
}

export function EditRequirementDialog({
  projectId,
  taskOptions,
  wbsOptions,
  requirement,
}: {
  projectId: string;
  taskOptions: Option[];
  wbsOptions: Option[];
  requirement: RequirementDefaults;
}) {
  return (
    <FormDialog
      title="Edit requirement"
      action={updateRequirement}
      submitLabel="Save"
      className="sm:max-w-lg"
      trigger={
        <Button size="xs" variant="ghost">
          <Pencil className="size-3.5" /> Edit
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="requirementId" value={requirement.id} />
          <RequirementFields errors={errors} taskOptions={taskOptions} wbsOptions={wbsOptions} defaults={requirement} />
        </>
      )}
    </FormDialog>
  );
}
