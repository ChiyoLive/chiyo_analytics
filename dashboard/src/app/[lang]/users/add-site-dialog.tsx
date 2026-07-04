import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { PlusCircle, AlertCircle } from "lucide-react";
import type { UserListItem, PermissionPolicy } from "./shared";
import type { SubmitResult } from "./create-user-dialog";
import { UsersTrans } from "./page";

const getAddSiteSchema = (trans: UsersTrans) =>
  z.object({
    site_id: z.string().min(1, trans["users:site_id_required"]),
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

type AddSiteFormValues = {
  site_id: string;
  permissions: string;
};

type AddSiteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserListItem | undefined;
  onSubmit: (
    userId: string,
    siteId: string,
    permissions: PermissionPolicy[],
  ) => Promise<SubmitResult>;
  trans: UsersTrans;
};

export function AddSiteDialog({
  open,
  onOpenChange,
  user,
  onSubmit,
  trans,
}: AddSiteDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSubmitError(undefined);
    }
  }

  const schema = getAddSiteSchema(trans);

  const form = useForm<AddSiteFormValues>({
    resolver: zodResolver(
      schema as unknown as Parameters<typeof zodResolver>[0],
    ) as unknown as Resolver<AddSiteFormValues>,
    defaultValues: {
      site_id: "",
      permissions:
        '[\n  {\n    "effect": "allow",\n    "actions": ["read:analytics"]\n  }\n]',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        site_id: "",
        permissions:
          '[\n  {\n    "effect": "allow",\n    "actions": ["read:analytics"]\n  }\n]',
      });
    }
  }, [open, form]);

  const handleFormSubmit = async (data: AddSiteFormValues) => {
    if (!user) return;
    setSubmitting(true);
    setSubmitError(undefined);

    const parsed = JSON.parse(data.permissions);
    const res = await onSubmit(user.id, data.site_id, parsed);
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
            <PlusCircle />
            {trans["users:add_site"]} - {user?.nickname} (@{user?.username})
          </DialogTitle>
          <DialogDescription>
            {trans["users:add_site_desc"]}
          </DialogDescription>
        </DialogHeader>

        {submitError && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 dark:bg-red-950/10 dark:border-red-900 text-red-800 dark:text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="h-4.5 w-4.5" />
            <span>{submitError}</span>
          </div>
        )}

        <div className="space-y-4 my-4 max-h-[60vh] overflow-y-auto no-scrollbar">
          {user && (
            <form
              id="add-site-form"
              onSubmit={form.handleSubmit(handleFormSubmit)}
              className="p-1 space-y-4"
            >
              <Field>
                <FieldLabel htmlFor="site_id">
                  {trans["users:site_id"]}
                </FieldLabel>
                <Input
                  id="site_id"
                  placeholder="e.g. example-site-id"
                  className="h-10"
                  {...form.register("site_id")}
                />
                <FieldError>
                  {form.formState.errors.site_id?.message}
                </FieldError>
              </Field>

              <Field>
                <FieldLabel htmlFor="permissions">
                  {trans["users:policy_json"]}
                </FieldLabel>
                <Textarea
                  id="permissions"
                  rows={10}
                  className="w-full rounded-xl border border-input bg-background p-3.5 text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
            form="add-site-form"
            disabled={submitting}
            className="cursor-pointer"
          >
            {submitting ? "..." : trans["users:add_site_submit"]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
