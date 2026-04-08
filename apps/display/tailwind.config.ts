import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        patchops: {
          DEFAULT: "#0e2799",
          dark: "#091b6b",
          light: "#1a3acc",
        },
      },
      fontSize: {
        display: ["1.5rem", { lineHeight: "2rem" }],
        "display-lg": ["2rem", { lineHeight: "2.5rem" }],
        "display-xl": ["2.5rem", { lineHeight: "3rem" }],
      },
      keyframes: {
        "slide-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "border-glow": {
          from: { borderColor: "rgb(34 197 94 / 0.6)" },
          to: { borderColor: "rgb(34 197 94 / 0)" },
        },
      },
      animation: {
        "slide-in": "slide-in 0.4s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "pulse-slow": "pulse 2s ease-in-out infinite",
        "border-glow": "border-glow 2s ease-out forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
