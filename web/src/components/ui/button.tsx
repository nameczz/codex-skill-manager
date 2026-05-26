import * as React from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "default" | "primary" | "secondary" | "outline" | "ghost" | "destructive" | "icon";
type ButtonSize = "default" | "sm" | "lg" | "icon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClass: Record<ButtonVariant, string> = {
  default: "button primary",
  primary: "button primary",
  secondary: "button secondary",
  outline: "button secondary",
  ghost: "button ghost",
  destructive: "button danger",
  icon: "icon-button"
};

const sizeClass: Record<ButtonSize, string> = {
  default: "",
  sm: "button-sm",
  lg: "button-lg",
  icon: "icon-button"
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(variantClass[variant], sizeClass[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
