import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** Full-page boot spinner. */
export const Spinner = ({ label = "Loading" }) => (
  <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
    <span className="stencil-label">{label}</span>
  </div>
);

/** Inline spinner for buttons and panels. */
export const InlineSpinner = ({ className }) => (
  <Loader2
    className={cn("h-4 w-4 animate-spin text-muted-foreground", className)}
  />
);
