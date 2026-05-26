import * as React from "react";
import { cn } from "../../lib/utils";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive" | "success" | "warning" | "info";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClass: Record<BadgeVariant, string> = {
  default: "badge badge-default",
  secondary: "badge badge-secondary",
  outline: "badge badge-outline",
  destructive: "badge badge-destructive",
  success: "badge badge-success",
  warning: "badge badge-warning",
  info: "badge badge-info"
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return <span className={cn("badge", variantClass[variant], className)} {...props} />;
}

