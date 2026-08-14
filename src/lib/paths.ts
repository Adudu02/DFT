/**
 * Rutas de estado del usuario. El estado escribible (DB, reportes, config y
 * pricing editable) vive en `./data` del CWD, para que `npx motor-agentico`
 * escriba en el directorio del usuario y no en el paquete instalado (solo
 * lectura) ni en una DB compartida entre usuarios. Los defaults de fábrica
 * (pricing.json) se siembran desde el `data/` empaquetado junto al código.
 *
 * En un checkout de dev (se corre desde la raíz del repo) `cwd/data` ES el
 * `data/` del repo, así que no hay cambio de comportamiento.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Raíz del estado escribible. Default = `<cwd>/data` (capa app). Un consumidor
// que use el motor como librería la fija con setDataDir() antes de ingerir.
// ponytail: estado global de módulo, suficiente para un proceso single-tenant.
// Si algún día hay que ingerir varios roots a la vez en el mismo proceso, pasar
// el path explícito a openDb/loadPricing/loadConfig (ya lo aceptan) en vez de esto.
let dataRoot: string | null = null;

/** Estado escribible del usuario (default `<cwd>/data`, override con setDataDir). */
export function dataDir(): string {
  return dataRoot ?? join(process.cwd(), "data");
}

/** Fija la raíz del estado escribible (para embeber el motor como librería). */
export function setDataDir(dir: string): void {
  dataRoot = dir;
}

/** `data/` empaquetado junto al código: defaults de fábrica, solo lectura. */
function packagedDataDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "data");
}

/**
 * Crea `<cwd>/data` y siembra `pricing.json` desde el default del paquete si
 * falta (loadPricing no tiene fallback: el archivo es obligatorio). Idempotente;
 * llamar al arrancar server/cli/rebuild.
 */
export function ensureUserData(): void {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const pricing = join(dir, "pricing.json");
  if (!existsSync(pricing)) {
    const seed = join(packagedDataDir(), "pricing.json");
    if (existsSync(seed) && seed !== pricing) copyFileSync(seed, pricing);
  }
}
