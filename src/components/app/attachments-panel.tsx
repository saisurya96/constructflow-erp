import { and, desc, eq } from "drizzle-orm";
import { Paperclip, FileText, Trash2 } from "lucide-react";
import { db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import * as t from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { SectionCard } from "@/components/app/section-card";
import { ActionButton } from "@/components/app/action-button";
import { AttachmentUploader } from "@/components/app/attachment-uploader";
import { deleteAttachment } from "@/app/attachments/actions";
import { ATTACHMENT_WRITE_CAP } from "@/app/attachments/caps";

function formatBytes(n: number | null | undefined): string {
  const b = n ?? 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export async function AttachmentsPanel({
  entityType,
  entityId,
  title = "Documents",
}: {
  entityType: string;
  entityId: string;
  title?: string;
}) {
  const data = await db(async (tx, ctx) => {
    const items = await tx
      .select({
        id: t.attachments.id,
        fileName: t.attachments.fileName,
        mimeType: t.attachments.mimeType,
        sizeBytes: t.attachments.sizeBytes,
        description: t.attachments.description,
        createdAt: t.attachments.createdAt,
        uploadedBy: t.attachments.uploadedBy,
        uploaderName: t.users.fullName,
      })
      .from(t.attachments)
      .leftJoin(t.users, eq(t.users.id, t.attachments.uploadedBy))
      .where(
        and(
          eq(t.attachments.entityType, entityType),
          eq(t.attachments.entityId, entityId),
        ),
      )
      .orderBy(desc(t.attachments.createdAt));
    return { items, userId: ctx.userId, role: ctx.role };
  });

  // Only show the upload form to a role that can actually attach to this entity
  // (the server action enforces the same cap) — otherwise it's a control that
  // always errors, e.g. finance on a project (view ≠ manage).
  const writeCap = ATTACHMENT_WRITE_CAP[entityType];
  const canUpload = writeCap ? can(data.role, writeCap) : false;

  return (
    <SectionCard eyebrow="Attachments" title={title} noPadding>
      {canUpload && (
        <div className="border-b p-4">
          <AttachmentUploader entityType={entityType} entityId={entityId} />
          <p className="mt-2 text-xs text-muted-foreground">
            Drawings, signed copies, delivery notes, certificates — up to 8 MB each.
          </p>
        </div>
      )}

      {data.items.length === 0 ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Paperclip className="size-4" /> No documents attached yet.
        </div>
      ) : (
        <ul className="divide-y">
          {data.items.map((a) => {
            const canDelete =
              a.uploadedBy === data.userId || can(data.role, "admin.manage");
            return (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <a
                  href={`/attachments/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 items-center gap-2.5"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground hover:underline">
                      {a.fileName}
                    </span>
                    {a.description && (
                      <span className="block truncate text-xs text-muted-foreground">{a.description}</span>
                    )}
                    <span className="block text-xs text-muted-foreground tabular">
                      {formatBytes(a.sizeBytes)} · {formatDate(a.createdAt)}
                      {a.uploaderName ? ` · ${a.uploaderName}` : ""}
                    </span>
                  </span>
                </a>
                {canDelete && (
                  <ActionButton
                    action={deleteAttachment}
                    fields={{ attachmentId: a.id }}
                    variant="ghost"
                    size="icon-sm"
                    confirm={`Remove "${a.fileName}"? This can't be undone.`}
                    aria-label={`Delete ${a.fileName}`}
                  >
                    <Trash2 className="size-4" />
                  </ActionButton>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
