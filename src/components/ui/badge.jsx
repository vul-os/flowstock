import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Status pills. Each semantic gets a tinted surface + its own text ramp step,
 * so they stay legible on paper and on charcoal without a second set of rules.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors duration-fast",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border bg-transparent text-muted-foreground",
        // tinted, low-shout status surfaces — the table default
        flow: "border-transparent bg-primary-muted text-primary",
        signal: "border-transparent bg-signal-muted text-signal-text",
        success: "border-transparent bg-success-muted text-success",
        danger: "border-transparent bg-destructive-muted text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
