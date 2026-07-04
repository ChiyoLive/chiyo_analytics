import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { PenLine, AlertCircle } from "lucide-react";
import type { UserListItem, PermissionPolicy } from "./shared";
import type { SubmitResult } from "./create-user-dialog";
import { UsersTrans } from "./page";

const getEditPoliciesSchema = (trans: UsersTrans) =>
  z.object({
    permissions: z.string().refine((val) => {
      try {
        const parsed = JSON.parse(val);
        if (!Array.isArray(parsed)) return false;
        for (const p of parsed) {
          if (typeof p !== "object" || p === null) return false;
          if (p.effect !== "allow" && p.effect !== "deny") return false;
          if (!Array.isArray(p.actions)) return false;
        }
        return true;
      } catch {
        return false;
      }
    }, trans["users:invalid_policy_json"]),
  });

type EditPoliciesFormValues = {
  permissions: string;
};

type EditPoliciesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserListItem | undefined;
  siteId: string | undefined;
  onSubmit: (
    siteId: string,
    permissions: PermissionPolicy[],
  ) => Promise<SubmitResult>;
  trans: UsersTrans;
};

export function EditPoliciesDialog({
  open,
  onOpenChange,
  user,
  siteId,
  onSubmit,
  trans,
}: EditPoliciesDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);

  const site = user?.sites.find((s) => s.site_id === siteId);

  const schema = getEditPoliciesSchema(trans);

  const form = useForm<EditPoliciesFormValues>({
    resolver: zodResolver(
      schema as unknown as Parameters<typeof zodResolver>[0],
    ) as unknown as Resolver<EditPoliciesFormValues>,
    defaultValues: {
      permissions: site ? JSON.stringify(site.permissions, null, 2) : "",
    },
  });

  useEffect(() => {
    if (site) {
      form.reset({
        permissions: JSON.stringify(site.permissions, null, 2),
      });
    }
  }, [site, form]);

  const handleFormSubmit = async (data: EditPoliciesFormValues) => {
    if (!siteId) return;
    setSubmitting(true);
    setSubmitError(undefined);

    const parsed = JSON.parse(data.permissions);
    const res = await onSubmit(siteId, parsed);
    setSubmitting(false);
    if (res.success) {
      onOpenChange(false);
    } else {
      setSubmitError(res.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-4xl sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="w-4 h-4" />
            {user?.nickname} (@{user?.username}) -{" "}
            {trans["users:site_permissions"]}
          </DialogTitle>
          <DialogDescription>{`Site ID: ${site?.site_id}`}</DialogDescription>
        </DialogHeader>

        {submitError && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 dark:bg-red-950/10 dark:border-red-900 text-red-800 dark:text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="h-4.5 w-4.5" />
            <span>{submitError}</span>
          </div>
        )}

        <div className="space-y-4 my-4 max-h-[60vh] overflow-y-auto no-scrollbar">
          {site && (
            <form
              id="edit-policies-form"
              onSubmit={form.handleSubmit(handleFormSubmit)}
              className="p-1"
            >
              <Field>
                <FieldLabel htmlFor="permissions" className="sr-only">
                  {trans["users:policy_json"]}
                </FieldLabel>
                <Textarea
                  id="permissions"
                  rows={15}
                  {...form.register("permissions")}
                />
                <FieldError>
                  {form.formState.errors.permissions?.message}
                </FieldError>
              </Field>
            </form>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            {trans["common:cancel"]}
          </Button>
          <Button
            type="submit"
            form="edit-policies-form"
            disabled={submitting}
            className="cursor-pointer"
          >
            {submitting ? "..." : trans["common:save_changes"]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
