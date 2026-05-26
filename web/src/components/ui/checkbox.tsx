import * as React from "react";
import { cn } from "../../lib/utils";

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, ...props }, ref) => {
  return <input ref={ref} type="checkbox" className={cn("checkbox", className)} {...props} />;
});

Checkbox.displayName = "Checkbox";

