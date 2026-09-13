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
        // Tema "Nocturne": fondo cálido oscuro, acento carmesí/rosa, texto marfil.
        // Se conservan los nombres `term-*` para no reescribir cada página; el
        // significado cambió: term-amber = acento carmesí, no ámbar.
        term: {
          bg: "#121110",
          panel: "#1c1a17",
          border: "rgba(237,232,224,0.10)",
          amber: "#e56b83", // acento (gold-bright)
          amberdim: "#c2415a", // acento tenue (gold)
          green: "#7dd35f", // positivo/ahorro (se mantiene verde, legible sobre el fondo)
          red: "#ef4444", // aviso/error — distinguible del acento carmesí, legible sobre el fondo
          muted: "#948a78",
          text: "#ede8e0",
        },
      },
      fontFamily: {
        // "num" para cifras (Bricolage Grotesque); "sans" para el cuerpo.
        num: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        sans: ['"Bricolage Grotesque"', "system-ui", "-apple-system", "sans-serif"],
        serif: ['"Instrument Serif"', "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
