/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./app/**/*.{js,jsx}",
    "./src/**/*.{js,jsx}",
    "./index.html",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          muted: "hsl(var(--primary-muted))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          muted: "hsl(var(--destructive-muted))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          muted: "hsl(var(--success-muted))",
        },
        signal: {
          DEFAULT: "hsl(var(--signal))",
          foreground: "hsl(var(--signal-foreground))",
          text: "hsl(var(--signal-text))",
          muted: "hsl(var(--signal-muted))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // raw scales, for deliberate one-off shading
        kraft: {
          50: "hsl(var(--kraft-50))",
          100: "hsl(var(--kraft-100))",
          200: "hsl(var(--kraft-200))",
          300: "hsl(var(--kraft-300))",
          400: "hsl(var(--kraft-400))",
          500: "hsl(var(--kraft-500))",
          600: "hsl(var(--kraft-600))",
          700: "hsl(var(--kraft-700))",
          800: "hsl(var(--kraft-800))",
          900: "hsl(var(--kraft-900))",
          950: "hsl(var(--kraft-950))",
        },
        flow: {
          50: "hsl(var(--flow-50))",
          100: "hsl(var(--flow-100))",
          200: "hsl(var(--flow-200))",
          300: "hsl(var(--flow-300))",
          400: "hsl(var(--flow-400))",
          500: "hsl(var(--flow-500))",
          600: "hsl(var(--flow-600))",
          700: "hsl(var(--flow-700))",
          800: "hsl(var(--flow-800))",
          900: "hsl(var(--flow-900))",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "var(--radius-lg)",
        "2xl": "var(--radius-xl)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
      },
      fontFamily: {
        sans: [
          "Archivo Variable",
          "Archivo",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "IBM Plex Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        // ops-density typographic scale
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
        xs: ["0.75rem", { lineHeight: "1.05rem" }],
        sm: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.875rem", { lineHeight: "1.4rem" }],
        lg: ["1rem", { lineHeight: "1.5rem", letterSpacing: "-0.008em" }],
        xl: ["1.125rem", { lineHeight: "1.6rem", letterSpacing: "-0.012em" }],
        "2xl": [
          "1.375rem",
          { lineHeight: "1.75rem", letterSpacing: "-0.018em" },
        ],
        "3xl": ["1.75rem", { lineHeight: "2.1rem", letterSpacing: "-0.022em" }],
        "4xl": [
          "2.25rem",
          { lineHeight: "2.55rem", letterSpacing: "-0.026em" },
        ],
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        "in-out": "var(--ease-in-out)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-rise": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
        "flow-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s var(--ease-out)",
        "accordion-up": "accordion-up 0.2s var(--ease-out)",
        "fade-rise": "fade-rise var(--duration-base) var(--ease-out) both",
        "flow-pulse": "flow-pulse 1.8s var(--ease-in-out) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
