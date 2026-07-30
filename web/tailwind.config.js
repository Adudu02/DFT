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
        // Tema terminal ambar/negro.
        term: {
          bg: "#0a0a0a",
          panel: "#141210",
          border: "#3a2f1a",
          amber: "#ffb000",
          amberdim: "#b87a00",
          green: "#7dd35f",
          red: "#e5533c",
          muted: "#8a7a55",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
