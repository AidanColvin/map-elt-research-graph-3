/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  // Preflight is disabled so Tailwind only adds utility classes and never
  // resets the existing inline-styled app.
  corePlugins: { preflight: false },
  theme: {
    // A strict, minimal palette: paper/ink neutrals, one restrained accent, and
    // the two semantic colors the charts need. No decorative hues.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "#ffffff",
      black: "#0a0a0a",
      paper: "#faf9f7",
      panel: "#ffffff",
      ink: "#1d1d1f",
      muted: "#6b6b70",
      faint: "#9a9a9f",
      line: "#e7e4df",
      accent: "#4f46e5",
      positive: "#15803d",
      negative: "#b91c1c",
    },
    extend: {
      fontFamily: {
        // Inter first, matching the global --sans stack in globals.css.
        sans: [
          "var(--font-inter)",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      // Extra whitespace steps so components can breathe (Apple-tier spacing).
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
        30: "7.5rem",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};
