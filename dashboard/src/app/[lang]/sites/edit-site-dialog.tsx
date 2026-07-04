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
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { Edit, Loader2 } from "lucide-react";
import type { SitesTrans } from "./page";

export type EditSitePayload = {
  name: string;
  jwks_url: string;
};

export type EditSiteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: { id: string; name: string; jwks_url: string | null } | undefined;
  onSubmit: (
    id: string,
    data: EditSitePayload,
  ) => Promise<{ success: boolean; error?: string }>;
  trans: SitesTrans;
};

const getEditSiteSchema = (trans: SitesTrans) =>
  z.object({
    name: z.string().min(1, trans["sites:name_required"]).max(255).trim(),
    jwks_url: z
      .string()
      .max(1024)
      .refine(
        (val) => {
          if (!val) return true;
          try {
            const u = new URL(val);
            return u.protocol === "http:" || u.protocol === "https:";
          } catch {
            return false;
          }
        },
        { message: "Must be a valid URL starting with http:// or https://" },
      )
      .trim(),
  });

type FormValues = z.infer<ReturnType<typeof getEditSiteSchema>>;

export function EditSiteDialog({
  open,
  onOpenChange,
  site,
  onSubmit,
  trans,
}: EditSiteDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const schema = getEditSiteSchema(trans);

  const form = useForm<FormValues>({
    resolver: zodResolver(
      schema as unknown as Parameters<typeof zodResolver>[0],
    ) as unknown as Resolver<FormValues>,
    defaultValues: {
      name: "",
      jwks_url: "",
    },
  });

  // Reset form when site changes
  useEffect(() => {
    if (site) {
      form.reset({
        name: site.name,
        jwks_url: site.jwks_url || "",
      });
      setFormError(undefined); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [site, form]);

  const handleFormSubmit = async (data: FormValues) => {
    if (!site) return;
    setSubmitting(true);
    setFormError(undefined);
    try {
      const res = await onSubmit(site.id, {
        name: data.name,
        jwks_url: data.jwks_url || "",
      });
      if (res.success) {
        onOpenChange(false);
      } else {
        setFormError(res.error || trans["sites:failed_update_site"]);
      }
    } catch (err) {
      console.error(err);
      setFormError(trans["users:network_error_submit"]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full" id="edit-site-form">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-primary" />
            {trans["sites:edit"]}
          </DialogTitle>
          <DialogDescription>{`Site ID: ${site?.id}`}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="space-y-4 py-2"
        >
          {formError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs rounded-xl border border-red-100 dark:border-red-900/30 flex items-center gap-2">
              <span className="font-semibold">{trans["common:error"]}:</span>
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-4">
            <Field>
              <FieldLabel
                htmlFor="edit-name"
                className="text-xs font-semibold text-muted-foreground block mb-1"
              >
                {trans["sites:name"]}
              </FieldLabel>
              <Input
                id="edit-name"
                disabled={submitting}
                placeholder="e.g. My Production Website"
                {...form.register("name")}
                className="h-9 w-full bg-background"
                data-testid="edit-site-name-input"
              />
              <FieldError>{form.formState.errors.name?.message}</FieldError>
            </Field>

            <Field>
              <FieldLabel
                htmlFor="edit-jwks_url"
                className="text-xs font-semibold text-muted-foreground block mb-1"
              >
                {trans["sites:jwks_url"]}
              </FieldLabel>
              <Input
                id="edit-jwks_url"
                disabled={submitting}
                placeholder="e.g. https://my-app.com/api/jwks"
                {...form.register("jwks_url")}
                className="h-9 w-full bg-background"
                data-testid="edit-site-jwks-input"
              />
              <FieldError>{form.formState.errors.jwks_url?.message}</FieldError>
            </Field>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              className="h-9 cursor-pointer"
            >
              {trans["common:cancel"]}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="h-9 cursor-pointer"
              data-testid="edit-site-submit-btn"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ...
                </>
              ) : (
                trans["common:save_changes"]
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
