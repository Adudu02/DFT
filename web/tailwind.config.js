import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// fast-glob (tailwind) exige separadores '/', incluso en Windows.
const d = dirname(fileURLToPath(import.meta.url)).replaceAll("\\", "/");

/** @type {import('tailwindcss').Config} */
export default {
  // Rutas absolutas: robustas sea cual sea el CWD desde el que corre Vite.
  content: [join(d, "index.html").replaceAll("\\", "/"), join(d, "src/**/*.{ts,tsx}").replaceAll("\\", "/")],
  theme: {
    extend: {
      colors: {
        // Tema "Arcade": fondo claro y espacioso, tarjetas blancas, acento azul.
        // Se conservan los nombres `term-*` para no reescribir cada página; el
        // significado cambió de nuevo: term-amber = acento azul, no carmesí.
        term: {
          bg: "#f6f7f9",
          panel: "#ffffff",
          border: "rgba(15,23,42,0.08)",
          amber: "#4c6ef5", // acento primario (azul)
          green: "#16a34a", // positivo/ahorro
          red: "#dc2626", // aviso/error
          muted: "#6b7280",
          text: "#14161b",
        },
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 12px 24px -12px rgba(15,23,42,0.12)",
      },
      fontFamily: {
        // "num" para cifras (Bricolage Grotesque); "sans" para el cuerpo.
        num: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        sans: ['"Bricolage Grotesque"', "system-ui", "-apple-system", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
