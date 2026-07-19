import * as React from "react";
import {
  Dialog as UIDialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { cn } from "../lib/utils";

/* Wrappers over vendored shadcn overlays — stable API (Dialog title/footer; Menu
   trigger/items) for record-core/apps. */

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <UIDialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </UIDialog>
  );
}

export function Menu({
  trigger,
  items,
}: {
  trigger: React.ReactElement;
  items: { key: string; label: React.ReactNode; danger?: boolean; onSelect: () => void }[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={5}>
        {items.map((it) => (
          <DropdownMenuItem
            key={it.key}
            variant={it.danger ? "destructive" : "default"}
            className={cn(it.danger && "text-[var(--nx-danger)]")}
            onSelect={it.onSelect}
          >
            {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
