/**
 * Raíz del estado escribible del motor (DB, reportes, config, pricing editable).
 * Default = `<cwd>/data`. Un consumidor que use el motor como librería la fija
 * con setDataDir() antes de ingerir. El sembrado del pricing por defecto y la
 * creación del directorio son responsabilidad de la capa app (no del core).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ponytail: estado global de módulo, suficiente para un proceso single-tenant.
// Si algún día hay que ingerir varios roots a la vez en el mismo proceso, pasar
// el path explícito a openDb/loadPricing/loadConfig (ya lo aceptan) en vez de esto.
let dataRoot: string | null = null;

/** Estado escribible del motor (default `<cwd>/data`, override con setDataDir). */
export function dataDir(): string {
  return dataRoot ?? join(process.cwd(), "data");
}

/** Fija la raíz del estado escribible (para embeber el motor como librería). */
export function setDataDir(dir: string): void {
  dataRoot = dir;
}

/**
 * Ruta al `pricing.json` de fábrica que se empaqueta con el core (rates por
 * defecto, solo lectura). La capa app lo usa para sembrar el estado del usuario.
 */
export function packagedPricingPath(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // dist/lib | src/lib
  return join(here, "..", "..", "data", "pricing.json");
}
