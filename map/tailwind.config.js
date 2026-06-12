/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  // Preflight is disabled so Tailwind only adds utility classes and never
  // resets the existing inline-styled app.
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};
