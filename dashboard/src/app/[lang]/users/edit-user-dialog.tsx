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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldLabel,
  FieldContent,
  FieldTitle,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import { UserCog, AlertCircle } from "lucide-react";
import type { UserListItem } from "./shared";
import type { SubmitResult } from "./create-user-dialog";
import { UsersTrans } from "./page";

const getEditUserSchema = (trans: UsersTrans) =>
  z.object({
    username: z.string().min(1, trans["users:username_required"]),
    nickname: z.string().min(1, trans["users:nickname_required"]),
    email: z.string().email(trans["users:invalid_email"]),
    password: z.string().refine((val) => val === "" || val.length >= 6, {
      message: trans["users:password_min_length"],
    }),
    is_superuser: z.boolean(),
  });

export type EditUserPayload = {
  username: string;
  nickname: string;
  email: string;
  password?: string;
  is_superuser: boolean;
};

type EditUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserListItem | undefined;
  onSubmit: (userId: string, payload: EditUserPayload) => Promise<SubmitResult>;
  trans: UsersTrans;
};

export function EditUserDialog({
  open,
  onOpenChange,
  user,
  onSubmit,
  trans,
}: EditUserDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSubmitError(undefined);
    }
  }

  const schema = getEditUserSchema(trans);

  const form = useForm<EditUserPayload>({
    resolver: zodResolver(
      schema as unknown as Parameters<typeof zodResolver>[0],
    ) as unknown as Resolver<EditUserPayload>,
    defaultValues: {
      username: "",
      nickname: "",
      email: "",
      password: "",
      is_superuser: false,
    },
  });

  useEffect(() => {
    if (open && user) {
      form.reset({
        username: user.username,
        nickname: user.nickname,
        email: user.email,
        password: "",
        is_superuser: user.is_superuser,
      });
    }
  }, [open, user, form]);

  const handleFormSubmit = async (data: EditUserPayload) => {
    if (!user) return;
    setSubmitting(true);
    setSubmitError(undefined);

    const res = await onSubmit(user.id, data);
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
            <UserCog />
            {trans["users:edit_title"]} - {user?.nickname} (@{user?.username})
          </DialogTitle>
          <DialogDescription>
            {trans["users:edit_desc"]}
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
              id="edit-user-form"
              onSubmit={form.handleSubmit(handleFormSubmit)}
              className="p-1 space-y-4"
            >
              {/* Profile Fields */}
              <div className="flex flex-col gap-4">
                <Field>
                  <FieldLabel
                    htmlFor="edit_username"
                    className="text-xs font-bold text-muted-foreground uppercase tracking-wider"
                  >
                    {trans["users:username"]}
                  </FieldLabel>
                  <Input
                    id="edit_username"
                    placeholder="e.g. johndoe"
                    className="h-10"
                    {...form.register("username")}
                  />
                  <FieldError>
                    {form.formState.errors.username?.message}
                  </FieldError>
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="edit_nickname"
                    className="text-xs font-bold text-muted-foreground uppercase tracking-wider"
                  >
                    {trans["users:nickname"]}
                  </FieldLabel>
                  <Input
                    id="edit_nickname"
                    placeholder="e.g. John Doe"
                    className="h-10"
                    {...form.register("nickname")}
                  />
                  <FieldError>
                    {form.formState.errors.nickname?.message}
                  </FieldError>
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="edit_email"
                    className="text-xs font-bold text-muted-foreground uppercase tracking-wider"
                  >
                    {trans["users:email"]}
                  </FieldLabel>
                  <Input
                    id="edit_email"
                    type="email"
                    placeholder="e.g. john@example.com"
                    className="h-10"
                    {...form.register("email")}
                  />
                  <FieldError>
                    {form.formState.errors.email?.message}
                  </FieldError>
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="edit_password"
                    className="text-xs font-bold text-muted-foreground uppercase tracking-wider"
                  >
                    {trans["users:password"]}{" "}
                    {trans["users:password_keep_hint"]}
                  </FieldLabel>
                  <Input
                    id="edit_password"
                    type="password"
                    placeholder={trans["users:password_placeholder_edit"]}
                    className="h-10"
                    {...form.register("password")}
                  />
                  <FieldError>
                    {form.formState.errors.password?.message}
                  </FieldError>
                </Field>
              </div>

              {/* Is Superuser Selector */}
              <div className="pt-2">
                <FieldLabel>
                  <Field orientation="horizontal">
                    <Checkbox
                      id="edit_is_superuser"
                      className="cursor-pointer"
                      checked={form.watch("is_superuser")} // eslint-disable-line react-hooks/incompatible-library
                      onCheckedChange={(checked) =>
                          form.setValue("is_superuser", !!checked)
                      }
                    />
                    <FieldContent>
                      <FieldTitle>
                        {trans["users:superuser_account"]}
                      </FieldTitle>
                      <FieldDescription>
                        {trans["users:superuser_desc"]}
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                </FieldLabel>
              </div>
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
            form="edit-user-form"
            disabled={submitting}
            className="cursor-pointer"
            data-testid="edit-user-submit-btn"
          >
            {submitting ? "..." : trans["common:save_changes"]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
