import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink:    "rgb(var(--ink) / <alpha-value>)",
        panel:  "rgb(var(--panel) / <alpha-value>)",
        panel2: "rgb(var(--panel2) / <alpha-value>)",
        edge:   "rgb(var(--edge) / <alpha-value>)",
        text:   "rgb(var(--text) / <alpha-value>)",
        mute:   "rgb(var(--mute) / <alpha-value>)",
        acad:   "rgb(var(--acad) / <alpha-value>)",
        dsml:   "rgb(var(--dsml) / <alpha-value>)",
        aiml:   "rgb(var(--aiml) / <alpha-value>)",
        devops: "rgb(var(--devops) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Sora", "system-ui", "sans-serif"],
        sans:    ["Inter", "system-ui", "sans-serif"],
        mono:    ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        card:   "0 1px 0 0 rgba(255,255,255,.04) inset, 0 20px 40px -20px rgba(0,0,0,.7), 0 2px 8px rgba(0,0,0,.4)",
        cardH:  "0 1px 0 0 rgba(255,255,255,.06) inset, 0 30px 60px -20px rgba(0,0,0,.8), 0 4px 12px rgba(0,0,0,.5)",
      },
    },
  },
  plugins: [],
} satisfies Config;
