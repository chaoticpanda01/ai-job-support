"use client";

import { createContext, useCallback, useContext, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Imperative confirm dialog — `await confirm({ title, variant: "destructive" })`
 * resolves true/false, same call shape as window.confirm() but as a real,
 * styled, accessible dialog instead of a blocking browser popup.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmDialogProvider");
  }
  return ctx;
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  function settle(result: boolean) {
    pending?.resolve(result);
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={pending !== null} onOpenChange={(open) => !open && settle(false)}>
        {pending && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{pending.options.title}</DialogTitle>
              {pending.options.description && (
                <DialogDescription>{pending.options.description}</DialogDescription>
              )}
            </DialogHeader>
            <DialogFooter>
              <button
                type="button"
                onClick={() => settle(false)}
                className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
              >
                {pending.options.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                className={
                  pending.options.variant === "destructive"
                    ? "rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90"
                    : "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                }
              >
                {pending.options.confirmLabel ?? "Confirm"}
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}
