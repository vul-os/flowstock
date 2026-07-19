import { useEffect, useState } from "react";

import { useTheme } from "@/components/theme-provider";

/**
 * Chart colour, derived from the theme rather than hard-coded.
 *
 * The categorical ramp is a fixed order — slot 0 is always teal, slot 1 always
 * amber — so a filter that drops a series never repaints the survivors. Both
 * modes were validated for the OKLCH lightness band, a chroma floor, adjacent
 * CVD separation (deutan/protan/tritan), normal-vision separation and contrast
 * against their own surface. Dark is a selected set of steps, not a flip of
 * light.
 */
export const CATEGORICAL = {
  light: ["#008C9E", "#D98407", "#C0442C", "#4A5CC4", "#5E8020"],
  dark: ["#22A0B2", "#C08420", "#D0495F", "#7386DD", "#7E9C30"],
};

/** Reads a semantic token off the document so charts track the live theme. */
const readToken = (name, fallback) => {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return raw ? `hsl(${raw})` : fallback;
};

export function useChartTheme() {
  const { theme } = useTheme();
  const [tokens, setTokens] = useState(() => resolve(theme));

  useEffect(() => {
    // wait a frame so the .dark class is on the element before we measure
    const id = requestAnimationFrame(() => setTokens(resolve(theme)));
    return () => cancelAnimationFrame(id);
  }, [theme]);

  return tokens;
}

function resolve(theme) {
  const isDark =
    theme === "dark" ||
    (typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"));
  return {
    isDark,
    // recessive grid and axis ink — the data is the loud part
    grid: readToken("--border", isDark ? "#2f2a26" : "#e1e0d9"),
    axisInk: readToken("--muted-foreground", "#898781"),
    surface: readToken("--card", isDark ? "#1c1917" : "#fbf8f1"),
    primary: readToken("--primary", "#008C9E"),
    categorical: isDark ? CATEGORICAL.dark : CATEGORICAL.light,
    // hover cursor wash, warm rather than neutral black
    cursorFill: isDark ? "rgba(245,238,224,0.06)" : "rgba(40,34,28,0.05)",
    tooltip: {
      background: readToken("--popover", isDark ? "#1f1c19" : "#fbf8f1"),
      border: `1px solid ${readToken("--border", "#e1e0d9")}`,
      borderRadius: "0.5rem",
      color: readToken("--popover-foreground", "#241f1a"),
      fontSize: "0.8125rem",
      boxShadow:
        "0 4px 8px -2px rgb(0 0 0 / 0.12), 0 12px 28px -6px rgb(0 0 0 / 0.18)",
    },
  };
}
