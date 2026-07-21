import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The readout a page opens with.
 *
 * This is deliberately *one panel divided by hairlines*, not a row of separate
 * cards. Six bordered boxes with gaps between them spend most of their area on
 * chrome and padding — the figures end up small, far apart, and swimming in
 * dead space, which reads as a marketing dashboard rather than as an instrument
 * an operator scans. Sharing one frame lets the numbers sit close enough to be
 * compared and gives the whole block a single edge instead of six.
 *
 * The figure is the largest thing in each cell, because it is what is actually
 * being read. The label above it is the stencilled crate marking the rest of
 * the product uses.
 */
export const StatRail = ({ className, children }) => (
  <div
    className={cn(
      "grid grid-cols-1 overflow-hidden rounded-lg border bg-card",
      "sm:grid-cols-2 lg:grid-cols-3",
      className,
    )}
  >
    {children}
  </div>
);

export const StatCell = ({
  title,
  value,
  detail,
  icon: Icon,
  /** "lead" marks the one figure the screen is actually about. */
  tone = "default",
  delta = null,
  className,
}) => {
  const trend = delta == null ? null : delta >= 0 ? "up" : "down";
  const TrendIcon = trend === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      className={cn(
        // Hairlines on every cell, clipped by the rail's overflow-hidden, so
        // the grid divides itself at any column count without a divide-x
        // utility guessing where the row breaks are.
        "relative -ml-px -mt-px border-l border-t px-5 py-4",
        tone === "lead" && "bg-primary/[0.04]",
        className,
      )}
    >
      {tone === "lead" ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-0.5 bg-primary"
        />
      ) : null}

      <div className="flex items-center gap-1.5">
        {Icon ? (
          <Icon
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
            aria-hidden="true"
          />
        ) : null}
        <span className="stencil-label">{title}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <span className="data-figure text-[1.75rem] font-semibold leading-none tracking-tight">
          {value}
        </span>
        {trend ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-semibold",
              trend === "up" ? "text-success" : "text-destructive",
            )}
          >
            <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(1)}%
          </span>
        ) : null}
      </div>

      {detail ? (
        <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
          {detail}
        </p>
      ) : null}
    </div>
  );
};

// The previous names, kept so every page keeps working while they migrate.
export const StatGrid = StatRail;
export const StatCard = StatCell;
