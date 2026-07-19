import { AlertTriangle, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The three states every data surface owes the operator. One look each, used
 * everywhere, so an empty products table and an empty ledger feel like the
 * same product rather than two people's guesses.
 */

export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className,
}) => (
  <div className={cn("state-panel", className)}>
    {Icon ? (
      <div className="state-panel-icon">
        <Icon className="h-5 w-5" />
      </div>
    ) : null}
    <div className="space-y-1">
      <p className="state-panel-title">{title}</p>
      {description ? <p className="state-panel-body">{description}</p> : null}
    </div>
    {action}
  </div>
);

export const LoadingState = ({ label = "Loading", className }) => (
  <div
    className={cn("state-panel", className)}
    role="status"
    aria-live="polite"
  >
    <div className="state-panel-icon">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
    <p className="stencil-label">{label}</p>
  </div>
);

export const ErrorState = ({
  title = "Something went wrong",
  description,
  action,
  className,
}) => (
  <div className={cn("state-panel state-panel--error", className)} role="alert">
    <div className="state-panel-icon bg-destructive/15 text-destructive">
      <AlertTriangle className="h-5 w-5" />
    </div>
    <div className="space-y-1">
      <p className="state-panel-title">{title}</p>
      {description ? <p className="state-panel-body">{description}</p> : null}
    </div>
    {action}
  </div>
);

/** Row-shaped shimmer for tables that are still fetching. */
export const TableSkeleton = ({ rows = 6, cols = 4 }) => (
  <div className="space-y-2 p-3" aria-hidden="true">
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex gap-3">
        {Array.from({ length: cols }).map((_, c) => (
          <div
            key={c}
            className="skeleton h-4 flex-1"
            style={{ animationDelay: `${(r * cols + c) * 40}ms` }}
          />
        ))}
      </div>
    ))}
  </div>
);
