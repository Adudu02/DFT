import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const d = dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    // Ruta explicita: si no, tailwind busca el config desde el CWD raiz y no lo halla.
    tailwindcss: { config: join(d, "tailwind.config.js") },
    autoprefixer: {},
  },
};
