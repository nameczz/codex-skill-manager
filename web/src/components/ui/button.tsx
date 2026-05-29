import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva("button", {
  variants: {
    variant: {
      default: "primary",
      primary: "primary",
      secondary: "secondary",
      outline: "secondary",
      ghost: "ghost",
      destructive: "danger",
      icon: "icon-button"
    },
    size: {
      default: "",
      sm: "button-sm",
      lg: "button-lg",
      icon: "icon-button"
    }
  },
  defaultVariants: {
    variant: "default",
    size: "default"
  }
});

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
