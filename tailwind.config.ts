import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink:    "#0B0D12",
        panel:  "#12151C",
        panel2: "#171B24",
        edge:   "#232937",
        text:   "#E7EAF0",
        mute:   "#8A91A0",
        acad:   "#5B9DFF",
        dsml:   "#B57BFF",
        aiml:   "#5FE3B1",
        devops: "#FF9B5A",
      },
      fontFamily: {
        display: ['"Instrument Serif"', "serif"],
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
