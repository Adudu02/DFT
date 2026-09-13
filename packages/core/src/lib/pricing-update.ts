/**
 * Actualizador de `data/pricing.json` desde la DB curada de LiteLLM
 * (add-pricing-auto-updater). Precedencia: override manual > LiteLLM > tarifa
 * local preservada. La fuente es per-token; el mapper convierte a per-millón.
 * Toda escritura pasa por `savePricing` (validación + escritura atómica); ante
 * fuente inválida o red caída, el archivo local queda intacto.
 */
import type { Pricing, Rate } from "./pricing.js";
import { loadPricing, savePricing } from "./pricing.js";

export const LITELLM_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

/** Variantes de tier que el motor no modela; importar la barata subestimaría. */
const TIER_SUFFIXES = ["_batches", "_priority", "_flex", "_above_272k_tokens"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Mapea la DB cruda de LiteLLM a `Record<name, Rate>` (USD por millón):
 * - filtra entradas sin ambos costos per-token;
 * - solo `mode` chat/responses (descarta embeddings, imágenes, audio);
 * - excluye variantes de tier (`_batches`, `_flex`, `_priority`, `_above_272k`);
 * - quita el prefijo de proveedor (`openai/gpt-6-astra` → `gpt-6-astra`).
 */
export function mapLiteLLM(raw: unknown): Record<string, Rate> {
  if (!isRecord(raw)) throw new Error("fuente LiteLLM: se esperaba un objeto plano");
  const out: Record<string, Rate> = {};
  for (const [rawName, entry] of Object.entries(raw)) {
    if (!rawName || !isRecord(entry)) continue;
    if (TIER_SUFFIXES.some((s) => rawName.endsWith(s))) continue;
    const mode = entry.mode;
    if (mode !== undefined && mode !== "chat" && mode !== "responses") continue;
    const inputCost = entry.input_cost_per_token;
    const outputCost = entry.output_cost_per_token;
    if (typeof inputCost !== "number" || typeof outputCost !== "number" || !Number.isFinite(inputCost) || !Number.isFinite(outputCost) || inputCost < 0 || outputCost < 0) continue;
    const name = rawName.includes("/") ? rawName.slice(rawName.lastIndexOf("/") + 1) : rawName;
    if (!name || name in out) continue; // la primera clave gana: determinista
    // per-token → per-millón, 6 decimales para evitar ruido float.
    out[name] = {
      input: Number((inputCost * 1_000_000).toFixed(6)),
      output: Number((outputCost * 1_000_000).toFixed(6)),
    };
  }
  return out;
}

export interface MergedPricing {
  pricing: Pricing;
  updated: string[];
  added: string[];
  unchanged: string[];
  /** Modelos locales que la fuente no cubre (preservados con origen local). */
  missingRate: string[];
}

/** Merge 3-orígenes: overrides > LiteLLM > local preservado, con `sources`. */
export function mergePricing(
  current: Pricing,
  litellm: Record<string, Rate>,
  overrides: Record<string, Rate>,
): MergedPricing {
  const models: Record<string, Rate> = {};
  const sources: Record<string, string> = {};
  for (const [name, rate] of Object.entries(litellm)) {
    models[name] = rate;
    sources[name] = "litellm";
  }
  for (const [name, rate] of Object.entries(overrides)) {
    models[name] = rate;
    sources[name] = "override";
  }

  const updated: string[] = [];
  const unchanged: string[] = [];
  const missingRate: string[] = [];
  for (const [name, localRate] of Object.entries(current.models)) {
    const final = models[name];
    if (!final) {
      // La fuente no lo conoce: se preserva tal cual (nunca se elimina).
      models[name] = localRate;
      sources[name] = current.sources?.[name] ?? "local";
      missingRate.push(name);
      continue;
    }
    if (final.input !== localRate.input || final.output !== localRate.output) updated.push(name);
    else unchanged.push(name);
  }
  const added = Object.keys(models).filter((name) => !(name in current.models));

  const pricing: Pricing = { ...current, models, sources };
  return { pricing, updated, added, unchanged, missingRate };
}

export interface PricingUpdateReport {
  updated: string[];
  added: string[];
  unchanged: string[];
  missingRate: string[];
  error?: string;
}

const EMPTY: Omit<PricingUpdateReport, "error"> = { updated: [], added: [], unchanged: [], missingRate: [] };

/**
 * Descarga la fuente, valida, mergea y persiste atómicamente. Inyectable
 * (`fetchImpl`, `url`, `now`, paths) para tests sin red. Ante cualquier fallo
 * (red, fuente inválida, pricing local ilegible) NO toca el archivo.
 */
export async function runPricingUpdate(
  opts: {
    fetchImpl?: typeof fetch;
    url?: string;
    now?: () => Date;
    pricingPath?: string;
    overridesPath?: string;
  } = {},
): Promise<PricingUpdateReport> {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = opts.url ?? LITELLM_URL;

  let raw: unknown;
  try {
    const res = await doFetch(url);
    if (!res.ok) return { ...EMPTY, error: `HTTP ${res.status} descargando la fuente` };
    raw = await res.json();
  } catch (err) {
    return { ...EMPTY, error: `red: ${String(err)}` };
  }

  try {
    const litellm = mapLiteLLM(raw);
    const current = await loadPricing(opts.pricingPath);
    let overrides: Record<string, Rate> = {};
    if (opts.overridesPath) {
      try {
        overrides = (await loadPricing(opts.overridesPath)).models;
      } catch {
        overrides = {}; // sin overrides (o inválidos) => merge sin ellos
      }
    }
    const merged = mergePricing(current, litellm, overrides);
    const next: Pricing = {
      ...merged.pricing,
      verified_at: (opts.now ? opts.now() : new Date()).toISOString(),
      source_url: url,
    };
    await savePricing(next, opts.pricingPath);
    return {
      updated: merged.updated,
      added: merged.added,
      unchanged: merged.unchanged,
      missingRate: merged.missingRate,
    };
  } catch (err) {
    return { ...EMPTY, error: `fuente o pricing local inválidos: ${String(err)}` };
  }
}
