import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        placeholder: "hsl(var(--placeholder))",
        "surface-elevated": "hsl(var(--surface-elevated))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          light: "hsl(var(--primary-light))",
          soft: "hsl(var(--primary-soft))",
          dark: "hsl(var(--primary-dark))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground-contrast))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        expired: {
          DEFAULT: "hsl(var(--expired))",
          foreground: "hsl(var(--expired-foreground))",
          bg: "hsl(var(--expired-bg))",
        },
        expiring: {
          DEFAULT: "hsl(var(--expiring))",
          foreground: "hsl(var(--expiring-foreground))",
          bg: "hsl(var(--expiring-bg))",
        },
        valid: {
          DEFAULT: "hsl(var(--valid))",
          foreground: "hsl(var(--valid-foreground))",
          bg: "hsl(var(--valid-bg))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        /* Shape tokens */
        "card-lg": "var(--radius-card-lg)",
        "card": "var(--radius-card)",
        "button": "var(--radius-button)",
        "input": "var(--radius-input)",
        "dialog": "var(--radius-dialog)",
        "sm-control": "var(--radius-sm-control)",
        "badge": "var(--radius-badge)",
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      fontWeight: {
        regular: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      fontSize: {
        /* Page title desktop: 30px / 36px */
        "page-title-desktop": ["30px", { lineHeight: "36px", letterSpacing: "-0.025em", fontWeight: "700" }],
        /* Page title mobile: 24px / 30px */
        "page-title-mobile": ["24px", { lineHeight: "30px", letterSpacing: "-0.025em", fontWeight: "700" }],
        /* Section heading: 18px / 26px */
        "section-heading": ["18px", { lineHeight: "26px", letterSpacing: "-0.015em", fontWeight: "600" }],
        /* Card heading: 16px / 24px */
        "card-heading": ["16px", { lineHeight: "24px", fontWeight: "600" }],
        /* Body: 15px / 24px */
        "body": ["15px", { lineHeight: "24px", fontWeight: "400" }],
        "body-emphasized": ["15px", { lineHeight: "24px", fontWeight: "500" }],
        /* Button: 14px / 20px */
        "button": ["14px", { lineHeight: "20px", fontWeight: "600" }],
        /* Label: 13px / 18px */
        "label": ["13px", { lineHeight: "18px", fontWeight: "600" }],
        /* Metadata: 13px / 20px */
        "metadata": ["13px", { lineHeight: "20px", fontWeight: "500" }],
        "metadata-light": ["13px", { lineHeight: "20px", fontWeight: "400" }],
        /* Caption: 12px / 16px */
        "caption": ["12px", { lineHeight: "16px", fontWeight: "500" }],
        "caption-light": ["12px", { lineHeight: "16px", fontWeight: "400" }],
      },
      boxShadow: {
        /* Legacy card shadows — backward compatibility */
        'card': 'var(--card-shadow)',
        'card-hover': 'var(--card-shadow-hover)',
        /* Depth token shadows */
        '1': 'var(--shadow-1)',
        '2': 'var(--shadow-2)',
        /* Old primary-glow kept for backward compat, themed via primary */
        'primary-glow': '0 4px 14px hsl(var(--primary) / 0.3)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0", opacity: "0" },
          to: { height: "var(--radix-accordion-content-height)", opacity: "1" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)", opacity: "1" },
          to: { height: "0", opacity: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-out": {
          "0%": { opacity: "1", transform: "translateY(0)" },
          "100%": { opacity: "0", transform: "translateY(8px)" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "slide-in": {
          "0%": { transform: "translateX(-100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "slide-up": {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
        "skeleton": {
          "0%": { opacity: "1" },
          "50%": { opacity: "0.55" },
          "100%": { opacity: "1" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "border-glow": {
          "0%, 100%": { boxShadow: "0 0 8px 1px hsl(var(--primary) / 0.3)" },
          "50%": { boxShadow: "0 0 16px 3px hsl(var(--primary) / 0.4)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.3s ease-out",
        "accordion-up": "accordion-up 0.3s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "fade-out": "fade-out 0.3s ease-out",
        "scale-in": "scale-in 0.3s ease-out",
        "slide-in": "slide-in 0.4s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
        "shimmer": "shimmer 2s linear infinite",
        "skeleton": "skeleton 1.8s ease-in-out infinite",
        "float": "float 3s ease-in-out infinite",
        "spin-slow": "spin 3s linear infinite",
        "border-glow": "border-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
