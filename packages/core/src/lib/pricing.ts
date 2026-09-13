/**
 * Tarifas editables (./data/pricing.json). Modelo sin tarifa => null + registro
 * en UnknownModels (badge visible en UI). Nunca se estima en silencio (PLAN §2).
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readFileRO } from "./fs-readonly.js";
import { dataDir } from "./paths.js";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Valida datos externos antes de persistirlos. */
export function validatePricing(value: unknown): Pricing {
  if (!isRecord(value) || !isRecord(value.models)) throw new Error("pricing inválido: falta 'models'");
  for (const [model, rate] of Object.entries(value.models)) {
    if (!model.trim()) throw new Error("pricing inválido: nombre de modelo vacío");
    const input = isRecord(rate) ? rate.input : undefined;
    const output = isRecord(rate) ? rate.output : undefined;
    if (typeof input !== "number" || typeof output !== "number" || !Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) {
      throw new Error(`pricing inválido: tarifa inválida para ${model}`);
    }
  }
  for (const field of ["verified_at", "source_url", "note"] as const) {
    if (value[field] !== undefined && typeof value[field] !== "string") throw new Error(`pricing inválido: ${field} debe ser texto`);
  }
  return value as unknown as Pricing;
}

function defaultPricingPath(): string {
  return join(dataDir(), "pricing.json");
}

export async function loadPricing(path = defaultPricingPath()): Promise<Pricing> {
  const raw = await readFileRO(path);
  return validatePricing(JSON.parse(raw));
}

export async function savePricing(pricing: Pricing, path = defaultPricingPath()): Promise<Pricing> {
  const valid = validatePricing(pricing);
  await writeFile(path, `${JSON.stringify(valid, null, 2)}\n`, "utf8");
  return valid;
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
