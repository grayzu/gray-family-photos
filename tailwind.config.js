/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0d1410",
        surface: "#16201b",
        "surface-2": "#1e2a24",
        "border-subtle": "#2a3a32",
        "text-primary": "#ecfdf5",
        "text-muted": "#8da99c",
        accent: {
          DEFAULT: "#34d399",
          hover: "#10b981",
        },
        lime: "#a3e635",
        gold: "#fbbf24",
        coral: "#fb7185",
        turquoise: "#5eead4",
      },
      backgroundImage: {
        "forest-radial":
          "radial-gradient(ellipse 80% 60% at 50% 0%, #16201b 0%, #0d1410 70%)",
      },
    },
  },
  plugins: [],
};
