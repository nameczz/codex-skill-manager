import * as React from "react";
import { cn } from "../../lib/utils";

type DialogContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

export function Dialog({
  open,
  onOpenChange,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return <DialogContext.Provider value={{ open, onOpenChange }}>{children}</DialogContext.Provider>;
}

function useDialogContext() {
  const value = React.useContext(DialogContext);
  if (value === null) {
    throw new Error("Dialog subcomponents must be used within <Dialog />.");
  }
  return value;
}

type DialogPortalProps = {
  children: React.ReactNode;
};

export function DialogPortal({ children }: DialogPortalProps) {
  const { open } = useDialogContext();
  if (!open) {
    return null;
  }

  return <div className="dialog-portal">{children}</div>;
}

type DialogOverlayProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export function DialogOverlay({ className, ...props }: DialogOverlayProps) {
  const { open, onOpenChange } = useDialogContext();
  if (!open) {
    return null;
  }

  return (
    <button
      type="button"
      className={cn("drawer-backdrop", className)}
      aria-label="Close"
      tabIndex={-1}
      onClick={() => onOpenChange(false)}
      {...props}
    />
  );
}

type DialogContentProps = React.HTMLAttributes<HTMLDivElement>;

export function DialogContent({ className, ...props }: DialogContentProps) {
  const { open } = useDialogContext();
  if (!open) {
    return null;
  }

  return <div role="dialog" aria-modal="true" className={cn(className)} {...props} />;
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("drawer-header", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn(className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("card-description", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("editor-footer", className)} {...props} />;
}
