import * as React from "react";
import "./primitives.css";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  busy?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", icon, busy, children, className = "", disabled, ...rest }, ref) => (
    <button
      ref={ref}
      className={`nxBtn nxBtn--${variant} nxBtn--${size} ${busy ? "nxBtn--busy" : ""} ${className}`}
      disabled={disabled || busy}
      {...rest}
    >
      {busy ? <span className="nxSpin" aria-hidden /> : icon}
      {children && <span>{children}</span>}
    </button>
  ),
);
Button.displayName = "Button";
