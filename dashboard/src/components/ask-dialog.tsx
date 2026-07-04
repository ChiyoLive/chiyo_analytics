"use client";

import mitt from "mitt";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { randomId } from "@/lib/id-generator";
import { AskDialogTrans } from "@/app/[lang]/layout";

export type ConfirmContext = {
  cancel: () => void;
  confirm: () => void;
  item: PendingConfirmItem;
};
export type ConfirmOptions = {
  id?: string;

  title: React.ReactNode;
  description?: React.ReactNode;

  content: React.ReactNode;

  cancelText?: string;
  cancelButton?: (ctx: ConfirmContext) => React.ReactNode;

  confirmText?: string;
  confirmButton?: (ctx: ConfirmContext) => React.ReactNode;
};

type PendingConfirmItem = ConfirmOptions & { id: string };

type AskDialogEvents = {
  "req-confirm": PendingConfirmItem;
  "res-confirm": [PendingConfirmItem, boolean];
};
const askDialogEvents = mitt<AskDialogEvents>();

export const ask = {
  confirm: (opt: ConfirmOptions) => {
    const id = opt.id ? opt.id : randomId();
    askDialogEvents.emit("req-confirm", { id, ...opt });

    return new Promise<boolean>((resolve) => {
      const handler = ([item, yes]: [PendingConfirmItem, boolean]) => {
        if (item.id === id) {
          askDialogEvents.off("res-confirm", handler);
          resolve(yes);
        }
      };
      askDialogEvents.on("res-confirm", handler);
    });
  },
};

export function AskDialog({ trans }: { trans: AskDialogTrans }) {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmItem[]>(
    [],
  );

  useEffect(() => {
    const listener = (item: PendingConfirmItem) => {
      setPendingConfirm((prev) => [...prev, item]);
    };

    askDialogEvents.on("req-confirm", listener);
    return () => askDialogEvents.off("req-confirm", listener);
  }, []);

  const responseConfirm = (item: PendingConfirmItem, yes: boolean) => {
    setPendingConfirm((prev) => prev.filter((i) => i.id !== item.id));
    askDialogEvents.emit("res-confirm", [item, yes]);
  };

  const cancel = (item: PendingConfirmItem) => responseConfirm(item, false);
  const confirm = (item: PendingConfirmItem) => responseConfirm(item, true);

  const current = pendingConfirm.at(-1);
  if (!current) return undefined;

  const ctx: ConfirmContext = {
    cancel: () => cancel(current),
    confirm: () => confirm(current),
    item: current,
  };

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) {
          cancel(current);
        }
      }}
    >
      <DialogContent id={current.id} data-testid="ask-confirm-dialog">
        <DialogHeader>
          <DialogTitle>{current.title}</DialogTitle>
          {current.description && (
            <DialogDescription>{current.description}</DialogDescription>
          )}
        </DialogHeader>

        {current.content}

        <DialogFooter>
          {current.cancelButton ? (
            current.cancelButton(ctx)
          ) : (
            <Button variant="outline" onClick={() => cancel(current)}>
              {current.cancelText ? current.cancelText : trans["common:cancel"]}
            </Button>
          )}

          {current.confirmButton ? (
            current.confirmButton(ctx)
          ) : (
            <Button onClick={() => confirm(current)}>
              {current.confirmText
                ? current.confirmText
                : trans["common:confirm"]}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
