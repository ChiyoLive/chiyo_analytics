import { useEffect, useState } from "react";
import {
  useForm,
  useFieldArray,
  Controller,
  type Resolver,
} from "react-hook-form";
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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus, AlertCircle, Plus, X } from "lucide-react";
import type { PermissionPolicy } from "./shared";
import {
  Field,
  FieldLabel,
  FieldContent,
  FieldTitle,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import { UsersTrans } from "./page";

const getCreateUserSchema = (trans: UsersTrans) => {
  const permissionPolicySchema = z.object({
    effect: z.enum(["allow", "deny"]),
    actions: z.array(z.string()),
  });

  const sitePermissionSchema = z.object({
    site_id: z.string().min(1, trans["users:site_id_required"]).trim(),
    permissions: z.string().refine((val) => {
      try {
        const parsed = JSON.parse(val);
        if (!Array.isArray(parsed)) return false;
        for (const p of parsed) {
          const res = permissionPolicySchema.safeParse(p);
          if (!res.success) return false;
        }
        return true;
      } catch {
        return false;
      }
    }, trans["users:invalid_policy_json"]),
  });

  return z.object({
    username: z
      .string()
      .min(1, trans["users:username_required"])
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        trans["users:username_invalid_chars"],
      )
      .trim(),
    nickname: z.string().min(1, trans["users:nickname_required"]).trim(),
    email: z.string().email(trans["users:invalid_email"]).trim(),
    password: z.string().min(6, trans["users:password_min_length"]),
    is_superuser: z.boolean().default(false),
    sites: z.array(sitePermissionSchema).default([]),
  });
};

type CreateUserFormValues = {
  username: string;
  nickname: string;
  email: string;
  password: string;
  is_superuser: boolean;
  sites: {
    site_id: string;
    permissions: string;
  }[];
};

export type SubmitResult = {
  success: boolean;
  error?: string;
};

export type CreateUserPayload = {
  username: string;
  nickname: string;
  email: string;
  password: string;
  is_superuser: boolean;
  sites: {
    site_id: string;
    permissions: PermissionPolicy[];
  }[];
};

type CreateUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateUserPayload) => Promise<SubmitResult>;
  trans: UsersTrans;
};

export function CreateUserDialog({
  open,
  onOpenChange,
  onSubmit,
  trans,
}: CreateUserDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);

  const schema = getCreateUserSchema(trans);

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(
      schema as unknown as Parameters<typeof zodResolver>[0],
    ) as unknown as Resolver<CreateUserFormValues>,
    defaultValues: {
      username: "",
      nickname: "",
      email: "",
      password: "",
      is_superuser: false,
      sites: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "sites",
  });

  useEffect(() => {
    if (open) {
      form.reset({
        username: "",
        nickname: "",
        email: "",
        password: "",
        is_superuser: false,
        sites: [],
      });
      setSubmitError(undefined);
    }
  }, [open, form]);

  const handleFormSubmit = async (data: CreateUserFormValues) => {
    setSubmitting(true);
    setSubmitError(undefined);

    const formattedSites = data.sites.map((site) => ({
      site_id: site.site_id,
      permissions: JSON.parse(site.permissions) as PermissionPolicy[],
    }));

    const payload: CreateUserPayload = {
      username: data.username,
      nickname: data.nickname,
      email: data.email,
      password: data.password,
      is_superuser: data.is_superuser,
      sites: formattedSites,
    };

    const res = await onSubmit(payload);
    setSubmitting(false);
    if (res.success) {
      onOpenChange(false);
    } else {
      setSubmitError(res.error);
    }
  };

  const handleAddSiteRow = () => {
    const defaultPolicy = JSON.stringify(
      [
        {
          effect: "allow",
          actions: ["read:analytics"],
        },
      ],
      null,
      2,
    );
    append({ site_id: "", permissions: defaultPolicy });
  };

  // eslint-disable-next-line react-hooks/incompatible-library
  const isSuperuser = form.watch("is_superuser");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-4xl sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <UserPlus />
            {trans["users:create_title"]}
          </DialogTitle>
          <DialogDescription>{trans["users:create_desc"]}</DialogDescription>
        </DialogHeader>

        <form
          id="create-user-form"
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="p-1 space-y-5 max-h-[60vh] overflow-y-auto no-scrollbar"
        >
          {submitError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 dark:bg-red-950/10 dark:border-red-900 text-red-800 dark:text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="h-4.5 w-4.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Profile Fields */}
          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel
                htmlFor="username"
                className="text-xs font-bold text-muted-foreground uppercase tracking-wider"
              >
                {trans["users:username"]}
              </FieldLabel>
              <Input
                id="username"
                placeholder="e.g. johndoe"
                className="h-10"
                {...form.register("username")}
              />
              <FieldError>{form.formState.errors.username?.message}</FieldError>
            </Field>

            <Field>
              <FieldLabel
                htmlFor="nickname"
                className="text-xs font-bold text-muted-foreground uppercase tracking-wider"
              >
                {trans["users:nickname"]}
              </FieldLabel>
              <Input
                id="nickname"
                placeholder="e.g. John Doe"
                className="h-10"
                {...form.register("nickname")}
              />
              <FieldError>{form.formState.errors.nickname?.message}</FieldError>
            </Field>

            <Field>
              <FieldLabel
                htmlFor="email"
                className="text-xs font-bold text-muted-foreground uppercase tracking-wider"
              >
                {trans["users:email"]}
              </FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="e.g. john@example.com"
                className="h-10"
                {...form.register("email")}
              />
              <FieldError>{form.formState.errors.email?.message}</FieldError>
            </Field>

            <Field>
              <FieldLabel
                htmlFor="password"
                className="text-xs font-bold text-muted-foreground uppercase tracking-wider"
              >
                {trans["users:password"]}
              </FieldLabel>
              <Input
                id="password"
                type="password"
                placeholder={trans["users:password_placeholder_create"]}
                className="h-10"
                {...form.register("password")}
              />
              <FieldError>{form.formState.errors.password?.message}</FieldError>
            </Field>
          </div>

          {/* Is Superuser Selector */}
          <Controller
            control={form.control}
            name="is_superuser"
            render={({ field }) => (
              <FieldLabel className="cursor-pointer font-normal">
                <Field orientation="horizontal">
                  <Checkbox
                    id="is_superuser"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <FieldContent>
                    <FieldTitle className="font-bold text-sm">
                      {trans["users:is_superuser"]}
                    </FieldTitle>
                    <FieldDescription>
                      {trans["users:superuser_bypass_desc"]}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>
            )}
          />

          {/* Site Permissions Section (Only show if not superuser) */}
          {!isSuperuser && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {trans["users:site_permissions"]}
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddSiteRow}
                  className="h-8 px-2.5 cursor-pointer"
                  data-testid="add-site-auth-btn"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {trans["users:add_site"]}
                </Button>
              </div>

              {fields.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
                  {trans["users:no_site_permissions_hint"]}
                </div>
              ) : (
                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="p-4 rounded-xl border border-border bg-card space-y-3 relative"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        className="absolute top-2 right-2 h-7 w-7 p-0 cursor-pointer hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
                      >
                        <X className="h-4 w-4" />
                      </Button>

                      <div className="grid grid-cols-1 gap-4">
                        <Field>
                          <FieldLabel
                            htmlFor={`sites.${index}.site_id`}
                            className="text-xs font-semibold text-muted-foreground block mb-1"
                          >
                            {trans["users:site_id"]}
                          </FieldLabel>
                          <Input
                            id={`sites.${index}.site_id`}
                            placeholder="e.g. example-next-js"
                            className="h-9 w-full sm:w-1/2"
                            {...form.register(
                              `sites.${index}.site_id` as const,
                            )}
                          />
                          <FieldError>
                            {
                              form.formState.errors.sites?.[index]?.site_id
                                ?.message
                            }
                          </FieldError>
                        </Field>

                        <Field>
                          <FieldLabel
                            htmlFor={`sites.${index}.permissions`}
                            className="text-xs font-semibold text-muted-foreground block mb-1"
                          >
                            {trans["users:policy_json"]}
                          </FieldLabel>
                          <Textarea
                            id={`sites.${index}.permissions`}
                            rows={5}
                            placeholder={trans["users:policy_placeholder"]}
                            className="w-full rounded-xl border border-input bg-background p-3 text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            {...form.register(
                              `sites.${index}.permissions` as const,
                            )}
                          />
                          <FieldError>
                            {
                              form.formState.errors.sites?.[index]?.permissions
                                ?.message
                            }
                          </FieldError>
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>

        <DialogFooter className="border-t border-border pt-4">
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
            form="create-user-form"
            disabled={submitting}
            className="cursor-pointer"
            data-testid="create-user-submit-btn"
          >
            {submitting ? "..." : trans["users:create_submit"]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
