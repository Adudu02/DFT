/**
 * Tarifas editables (./data/pricing.json). Modelo sin tarifa => null + registro
 * en UnknownModels (badge visible en UI). Nunca se estima en silencio (PLAN §2).
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileRO } from "./fs-readonly.js";

export interface Rate {
  input: number;
  output: number;
}

export interface Pricing {
  models: Record<string, Rate>;
  verified_at?: string;
  source_url?: string;
  note?: string;
}

function defaultPricingPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "data", "pricing.json");
}

export async function loadPricing(path = defaultPricingPath()): Promise<Pricing> {
  const raw = await readFileRO(path);
  const p = JSON.parse(raw) as Pricing;
  if (!p.models || typeof p.models !== "object") throw new Error("pricing.json inválido: falta 'models'");
  return p;
}

export async function savePricing(pricing: Pricing, path = defaultPricingPath()): Promise<Pricing> {
  if (!pricing.models || typeof pricing.models !== "object") {
    throw new Error("pricing inválido: falta 'models'");
  }
  await writeFile(path, JSON.stringify(pricing, null, 2) + "\n", "utf8");
  return pricing;
}

/** Acumula los modelos vistos sin tarifa, únicos y en orden de aparición. */
export class UnknownModels {
  private seen = new Set<string>();
  add(model: string): void {
    this.seen.add(model);
  }
  list(): string[] {
    return [...this.seen];
  }
  get size(): number {
    return this.seen.size;
  }
}

/** Tarifa del modelo o null (registrándolo en `unknown` si se pasa). */
export function getRate(pricing: Pricing, model: string, unknown?: UnknownModels): Rate | null {
  const rate = pricing.models[model];
  if (rate) return rate;
  unknown?.add(model);
  return null;
}
