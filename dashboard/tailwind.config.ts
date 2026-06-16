import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Design system (plan §9.2) — slate-based dark theme.
        bg: "#0F172A",        // slate-900
        surface: "#1E293B",   // slate-800
        card: "#334155",      // slate-700
        primary: "#3B82F6",   // blue-500
        success: "#10B981",   // emerald-500
        warning: "#F59E0B",   // amber-500
        danger: "#EF4444",    // red-500
        accent: "#8B5CF6",    // violet-500
        "text-primary": "#F8FAFC",   // slate-50
        "text-secondary": "#94A3B8", // slate-400
      },
      borderRadius: {
        card: "12px",
        control: "8px",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
