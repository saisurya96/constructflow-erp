"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "./submit-button";
import { uploadAttachment } from "@/app/attachments/actions";

export function AttachmentUploader({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const [state, formAction] = useActionState(uploadAttachment, null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Uploaded");
      formRef.current?.reset();
      router.refresh();
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      <input
        type="file"
        name="file"
        required
        className="block max-w-full flex-1 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted"
      />
      <Input
        name="description"
        placeholder="Label (optional)"
        className="h-9 w-full sm:w-48"
        aria-label="Attachment label"
      />
      <SubmitButton size="sm" variant="outline">
        <Paperclip className="size-4" /> Upload
      </SubmitButton>
    </form>
  );
}
