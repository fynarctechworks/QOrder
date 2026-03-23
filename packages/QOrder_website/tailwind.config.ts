import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#F97316",
        "primary-hover": "#EA6C0A",
        "primary-light": "#FED7AA",
        "primary-muted": "rgba(249, 115, 22, 0.1)",
        accent: "#FDBA74",
        background: "#FFFFFF",
        "background-secondary": "#FFF7ED",
        surface: "#FFF7ED",
        "surface-elevated": "#FFFFFF",
        border: "#E5E7EB",
        "text-primary": "#1F2937",
        "text-secondary": "#4B5563",
        "text-muted": "#6B7280",
      },
      fontFamily: {
        sans: ["Quicksand", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 3px rgba(0,0,0,0.08)",
        card: "0 4px 12px -2px rgba(0,0,0,0.08)",
        elevated: "0 12px 24px -4px rgba(0,0,0,0.12)",
        glow: "0 0 20px rgba(249,115,22,0.25)",
      },
      maxWidth: {
        content: "1280px",
      },
    },
  },
  plugins: [],
};

export default config;
