import * as React from "react";

import { cn } from "@/lib/utils";

/** Shared field chrome — inputs, textareas and select triggers all wear it. */
export const fieldClasses =
  "flex w-full rounded-md border border-input bg-card text-sm text-foreground shadow-xs transition-[border-color,box-shadow] duration-fast ease-out placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/25";

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        fieldClasses,
        "h-9 px-3 py-1 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        // numerics read as data, not prose
        (type === "number" || type === "tel") && "font-mono tabular",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
