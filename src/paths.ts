/**
 * Capa app: sembrado del pricing por defecto y creación del directorio de
 * estado. La raíz (`dataDir`) y su override viven en el core (motor-agentico-core);
 * aquí solo se materializa el estado inicial que el motor espera al arrancar.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { dataDir, packagedPricingPath } from "motor-agentico-core";

/**
 * Crea el directorio de estado y siembra `pricing.json` desde el default de
 * fábrica del core si falta (loadPricing no tiene fallback: el archivo es
 * obligatorio). Idempotente; llamar al arrancar server/cli/rebuild.
 */
export function ensureUserData(): void {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const pricing = join(dir, "pricing.json");
  if (!existsSync(pricing)) {
    const seed = packagedPricingPath();
    if (existsSync(seed) && seed !== pricing) copyFileSync(seed, pricing);
  }
}
