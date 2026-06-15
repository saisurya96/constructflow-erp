import { asc, eq } from "drizzle-orm";
import { requireUser, db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import * as t from "@/db/schema";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { EmptyState } from "@/components/app/empty-state";
import { MyTaskRow, type MyTask } from "./my-work-row";

export const metadata = { title: "My Work · ConstructFlow" };

function midnight(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default async function MyWorkPage() {
  const user = await requireUser();
  const canSchedule = can(user.role, "schedule.manage");

  const rows = await db(async (tx) =>
    tx
      .select({
        id: t.tasks.id,
        name: t.tasks.name,
        status: t.tasks.status,
        priority: t.tasks.priority,
        dueDate: t.tasks.dueDate,
        projectId: t.tasks.projectId,
        projectName: t.projects.name,
        projectCode: t.projects.code,
      })
      .from(t.tasks)
      .innerJoin(t.projects, eq(t.projects.id, t.tasks.projectId))
      .where(eq(t.tasks.assigneeId, user.userId))
      .orderBy(asc(t.tasks.dueDate), asc(t.tasks.createdAt)),
  );

  const today = midnight(new Date());
  const weekEnd = new Date(today.getTime() + 7 * 86_400_000);

  const buckets: Record<string, MyTask[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    nodate: [],
    done: [],
  };

  for (const r of rows) {
    const due = r.dueDate ? midnight(new Date(r.dueDate + "T00:00:00")) : null;
    const overdue = !!due && r.status !== "done" && due.getTime() < today.getTime();
    const task: MyTask = { ...r, overdue };
    if (r.status === "done") buckets.done.push(task);
    else if (!due) buckets.nodate.push(task);
    else if (due.getTime() < today.getTime()) buckets.overdue.push(task);
    else if (due.getTime() === today.getTime()) buckets.today.push(task);
    else if (due.getTime() <= weekEnd.getTime()) buckets.week.push(task);
    else buckets.later.push(task);
  }

  const openCount = rows.filter((r) => r.status !== "done").length;
  const dueThisWeek = buckets.today.length + buckets.week.length;

  const sections: { key: string; title: string; description?: string; items: MyTask[] }[] = [
    { key: "overdue", title: "Overdue", description: "Past due and not done", items: buckets.overdue },
    { key: "today", title: "Due today", items: buckets.today },
    { key: "week", title: "Due this week", items: buckets.week },
    { key: "later", title: "Later", items: buckets.later },
    { key: "nodate", title: "No due date", items: buckets.nodate },
    { key: "done", title: "Completed", items: buckets.done.slice(0, 25) },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="My Work"
        title="My tasks"
        description="Everything assigned to you across every project — newest deadlines first."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open tasks" value={String(openCount)} />
        <StatCard
          label="Overdue"
          value={String(buckets.overdue.length)}
          tone={buckets.overdue.length > 0 ? "critical" : "good"}
        />
        <StatCard label="Due this week" value={String(dueThisWeek)} tone="info" />
        <StatCard label="Completed" value={String(buckets.done.length)} tone="good" />
      </div>

      {rows.length === 0 ? (
        <SectionCard>
          <EmptyState
            title="Nothing assigned to you yet"
            description="Tasks assigned to you on any project will show up here, grouped by deadline."
          />
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {sections
            .filter((s) => s.items.length > 0)
            .map((s) => (
              <SectionCard key={s.key} title={s.title} description={s.description} noPadding>
                <div className="divide-y">
                  {s.items.map((task) => (
                    <MyTaskRow key={task.id} task={task} canSchedule={canSchedule} />
                  ))}
                </div>
              </SectionCard>
            ))}
        </div>
      )}
    </div>
  );
}
