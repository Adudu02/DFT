/**
 * Tarifas editables (./data/pricing.json). Modelo sin tarifa => null + registro
 * en UnknownModels (badge visible en UI). Nunca se estima en silencio (PLAN §2).
 */
import { rename, writeFile } from "node:fs/promises";
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
  /** Origen de cada tarifa según el último updater run. */
  sources?: Record<string, string>;
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
  if (value.sources !== undefined) {
    if (!isRecord(value.sources)) throw new Error("pricing inválido: sources debe ser un objeto");
    for (const [model, origin] of Object.entries(value.sources)) {
      if (origin !== "litellm" && origin !== "modelsdev" && origin !== "override" && origin !== "local") {
        throw new Error(`pricing inválido: sources.${model} debe ser litellm|modelsdev|override|local`);
      }
    }
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
  const valid = validatePricing(pricing); // falla ANTES de tocar el disco
  // Escritura atómica: tmp + rename (nunca queda un archivo parcial).
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(valid, null, 2)}\n`, "utf8");
  await rename(tmp, path);
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

/**
 * Resolución determinista de tarifa (capa de resolución, no de datos):
 *  (a) match exacto;
 *  (b) sufijo de fecha de 8 dígitos (`-20251001`) si el prefijo existe como clave;
 *  (c) prefijo de proveedor (`openai/gpt-6-astra` → `gpt-6-astra`).
 * Los eventos guardan el nombre original; la normalización ocurre solo aquí.
 */
function resolveRate(pricing: Pricing, model: string): Rate | null {
  const exact = pricing.models[model];
  if (exact) return exact;
  const dated = /^(.+)-\d{8}$/.exec(model);
  if (dated) {
    const byPrefix = pricing.models[dated[1]];
    if (byPrefix) return byPrefix;
  }
  if (model.includes("/")) {
    const bare = model.slice(model.lastIndexOf("/") + 1);
    const byProvider = pricing.models[bare];
    if (byProvider) return byProvider;
  }
  return null;
}

/** Tarifa del modelo o null (registrándolo en `unknown` si se pasa). */
export function getRate(pricing: Pricing, model: string, unknown?: UnknownModels): Rate | null {
  const rate = resolveRate(pricing, model);
  if (rate) return rate;
  unknown?.add(model);
  return null;
}

/** Estado de frescura del pricing, computado localmente (sin red). */
export function pricingAgeStatus(
  pricing: Pricing,
  maxAgeDays: number,
  now = Date.now(),
): { status: "fresh" | "stale" | "unknown"; ageDays: number | null } {
  if (!pricing.verified_at) return { status: "unknown", ageDays: null };
  const ts = Date.parse(pricing.verified_at);
  if (Number.isNaN(ts)) return { status: "unknown", ageDays: null };
  const ageDays = (now - ts) / 86_400_000;
  return { status: ageDays <= maxAgeDays ? "fresh" : "stale", ageDays: Math.floor(ageDays) };
}
