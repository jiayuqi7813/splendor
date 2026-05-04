import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0a0f1e",
        gold: "#ffd700",
        gemWhite: "#f8fafc",
        gemBlue: "#1a6fc4",
        gemGreen: "#1a9c4a",
        gemRed: "#c41a1a",
        gemBrown: "#8b4513"
      },
      animation: {
        "pulse-gold": "pulseGold 1.8s ease-in-out infinite",
        "slide-in": "slideIn 0.45s ease-out both"
      },
      keyframes: {
        pulseGold: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(255, 215, 0, 0.45)" },
          "50%": { boxShadow: "0 0 24px 6px rgba(255, 215, 0, 0.55)" }
        },
        slideIn: {
          "0%": { transform: "translateY(-16px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" }
        }
      }
    }
  },
  plugins: []
} satisfies Config;
