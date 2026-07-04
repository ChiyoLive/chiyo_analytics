import { useState } from "react";
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
import {
  Field,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import { PlusCircle, Loader2 } from "lucide-react";
import type { SitesTrans } from "./page";

export type CreateSitePayload = {
  id: string;
  name: string;
  jwks_url: string;
};

type CreateSiteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateSitePayload) => Promise<{ success: boolean; error?: string }>;
  trans: SitesTrans;
};

const getCreateSiteSchema = (trans: SitesTrans) =>
  z.object({
    id: z
      .string()
      .min(1, trans["sites:id_required"])
      .max(255)
      .regex(/^[a-zA-Z0-9-_]+$/, trans["sites:id_invalid_chars"])
      .trim(),
    name: z.string().min(1, trans["sites:name_required"]).max(255).trim(),
    jwks_url: z
      .string()
      .max(1024)
      .refine((val) => {
        if (!val) return true;
        try {
          const u = new URL(val);
          return u.protocol === "http:" || u.protocol === "https:";
        } catch {
          return false;
        }
      }, { message: "Must be a valid URL starting with http:// or https://" })
      .trim(),
  });

type FormValues = z.infer<ReturnType<typeof getCreateSiteSchema>>;

export function CreateSiteDialog({
  open,
  onOpenChange,
  onSubmit,
  trans,
}: CreateSiteDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const schema = getCreateSiteSchema(trans);

  const form = useForm<FormValues>({
    resolver: zodResolver(
      schema as unknown as Parameters<typeof zodResolver>[0],
    ) as unknown as Resolver<FormValues>,
    defaultValues: {
      id: "",
      name: "",
      jwks_url: "",
    },
  });

  const handleFormSubmit = async (data: FormValues) => {
    setSubmitting(true);
    setFormError(undefined);
    try {
      const res = await onSubmit({
        id: data.id,
        name: data.name,
        jwks_url: data.jwks_url || "",
      });
      if (res.success) {
        form.reset();
        onOpenChange(false);
      } else {
        setFormError(res.error || trans["sites:failed_create_site"]);
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
      <DialogContent className="max-w-md w-full" id="create-site-form">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-primary" />
            {trans["sites:create"]}
          </DialogTitle>
          <DialogDescription>
            {trans["sites:desc"]}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 py-2">
          {formError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs rounded-xl border border-red-100 dark:border-red-900/30 flex items-center gap-2">
              <span className="font-semibold">{trans["common:error"]}:</span>
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-4">
            <Field>
              <FieldLabel htmlFor="id" className="text-xs font-semibold text-muted-foreground block mb-1">
                {trans["sites:id"]}
              </FieldLabel>
              <Input
                id="id"
                disabled={submitting}
                placeholder="e.g. my-app-production"
                {...form.register("id")}
                className="h-9 w-full bg-background"
                data-testid="create-site-id-input"
              />
              <FieldError>{form.formState.errors.id?.message}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor="name" className="text-xs font-semibold text-muted-foreground block mb-1">
                {trans["sites:name"]}
              </FieldLabel>
              <Input
                id="name"
                disabled={submitting}
                placeholder="e.g. My Production Website"
                {...form.register("name")}
                className="h-9 w-full bg-background"
                data-testid="create-site-name-input"
              />
              <FieldError>{form.formState.errors.name?.message}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor="jwks_url" className="text-xs font-semibold text-muted-foreground block mb-1">
                {trans["sites:jwks_url"]}
              </FieldLabel>
              <Input
                id="jwks_url"
                disabled={submitting}
                placeholder="e.g. https://my-app.com/api/jwks"
                {...form.register("jwks_url")}
                className="h-9 w-full bg-background"
                data-testid="create-site-jwks-input"
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
              data-testid="create-site-submit-btn"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ...
                </>
              ) : (
                trans["sites:create"]
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
