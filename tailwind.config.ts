import type { Config } from "tailwindcss";

export default {
  content: ["./web/index.html", "./web/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        "surface-sunken": "var(--surface-sunken)",
        text: "var(--text)",
        "text-muted": "var(--text-muted)",
        "text-soft": "var(--text-soft)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        accent: "var(--accent)",
        "accent-strong": "var(--accent-strong)",
        "accent-soft": "var(--accent-soft)",
        "accent-border": "var(--accent-border)",
        good: {
          bg: "var(--good-bg)",
          text: "var(--good-text)",
          border: "var(--good-border)"
        },
        warn: {
          bg: "var(--warn-bg)",
          text: "var(--warn-text)",
          border: "var(--warn-border)"
        },
        risk: {
          bg: "var(--risk-bg)",
          text: "var(--risk-text)",
          border: "var(--risk-border)"
        },
        info: {
          bg: "var(--info-bg)",
          text: "var(--info-text)"
        }
      },
      borderRadius: {
        app: "var(--radius)"
      },
      boxShadow: {
        app: "var(--shadow)",
        soft: "var(--shadow-soft)",
        dialog: "var(--shadow-dialog)",
        drawer: "var(--shadow-drawer)"
      }
    }
  }
} satisfies Config;
