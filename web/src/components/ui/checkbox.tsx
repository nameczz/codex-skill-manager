import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";

type CheckboxChangeEvent = {
  target: {
    checked: boolean;
  };
};

type CheckboxProps = Omit<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  "onCheckedChange" | "onChange"
> & {
  onChange?: (event: CheckboxChangeEvent) => void;
};

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, onChange, ...props }, ref) => {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn("checkbox", className)}
      onCheckedChange={(checked) => onChange?.({ target: { checked: checked === true } })}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="checkbox-indicator">
        <Check size={12} strokeWidth={3} aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

Checkbox.displayName = CheckboxPrimitive.Root.displayName;
