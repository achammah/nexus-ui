import * as React from "react";
import { Button as UIButton } from "../components/ui/button";
import { cn } from "../lib/utils";
import "./primitives.css";

/* Thin wrapper over the vendored shadcn Button — keeps the record-core/app API
   (variant primary/secondary/ghost/danger · size sm/md · busy · icon) stable across
   vendor refreshes. Local styling opinions live HERE, never in components/ui. */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VMAP = { primary: "default", secondary: "outline", ghost: "ghost", danger: "destructive" } as const;
const SMAP = { sm: "sm", md: "default" } as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  busy?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", icon, busy, children, className, disabled, ...rest }, ref) => (
    <UIButton
      ref={ref}
      variant={VMAP[variant]}
      size={children ? SMAP[size] : (size === "sm" ? "icon-sm" : "icon") as never}
      className={cn(className)}
      disabled={disabled || busy}
      {...rest}
    >
      {busy ? <span className="nxSpin" aria-hidden /> : icon}
      {children}
    </UIButton>
  ),
);
Button.displayName = "Button";
