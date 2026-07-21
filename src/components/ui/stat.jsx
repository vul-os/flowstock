import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The headline-figure card, used by every surface that opens with a row of
 * numbers.
 *
 * There were previously two of these — one on the dashboard (icon on top, value
 * above label, p-6) and one on Products (icon on the right, label above value,
 * p-4) — which is why the two screens read as different products. This is the
 * one both now use.
 *
 * The composition puts the *figure* first in the visual order, because that is
 * what an operator is actually reading. The label is the stencilled crate
 * marking above it, and the icon is deliberately small and muted: a 24px
 * saturated glyph next to a number competes with the number and wins, which is
 * what made the old dashboard read as six equally-urgent tiles.
 */
export const StatCard = ({
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
    <Card
      className={cn(
        "relative overflow-hidden",
        tone === "lead" && "border-primary/30",
        className,
      )}
    >
      {tone === "lead" ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5 bg-primary"
        />
      ) : null}
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="stencil-label">{title}</p>
          {Icon ? (
            <Icon
              className="h-4 w-4 shrink-0 text-muted-foreground/70"
              aria-hidden="true"
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="data-figure text-2xl font-semibold leading-none">
            {value}
          </p>
          {trend ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
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
          <p className="mt-auto text-xs text-muted-foreground">{detail}</p>
        ) : null}
      </CardContent>
    </Card>
  );
};

/**
 * The row a page opens with. Three across rather than six: at six the cards are
 * too narrow for a currency figure to sit on one line, which is what forced the
 * old dashboard down to a smaller type size than the rest of the product.
 */
export const StatGrid = ({ className, children }) => (
  <div
    className={cn(
      "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
      className,
    )}
  >
    {children}
  </div>
);
