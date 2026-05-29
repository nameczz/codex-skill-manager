import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva("badge", {
  variants: {
    variant: {
      default: "badge-default",
      secondary: "badge-secondary",
      outline: "badge-outline",
      destructive: "badge-destructive",
      success: "badge-success",
      warning: "badge-warning",
      info: "badge-info"
    }
  },
  defaultVariants: {
    variant: "default"
  }
});

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
