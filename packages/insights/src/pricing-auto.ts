/**
 * Auto-chequeo de pricing ligado a la ingesta (add-pricing-auto-updater,
 * adaptado al split core/insights): core provee las primitivas
 * (pricingAgeStatus, runPricingUpdate); insights orquesta porque es quien
 * conoce la config. Best-effort: máx. una vez por proceso, nunca bloquea la
 * ingesta y todo fallo degrada en silencio (offline sigue funcionando).
 */
import { loadPricing, pricingAgeStatus, runPricingUpdate, type Pricing } from "how-much-did-u-waste-core";
import type { Config } from "./config.js";

let checkedThisSession = false;

/** Solo para tests: reinicia el flag de una-vez-por-sesión. */
export function __resetAutoPricingCheckForTests(): void {
  checkedThisSession = false;
}

/**
 * Dispara la actualización de pricing si está vencido/sin verificar y
 * `pricing.autoUpdate` lo permite. Devuelve true si disparó un run (sin
 * esperar su resultado — fire and forget).
 */
export async function autoPricingCheck(
  config: Config,
  opts: { pricingPath?: string; run?: typeof runPricingUpdate } = {},
): Promise<boolean> {
  if (!config.pricing.autoUpdate || checkedThisSession) return false;
  let pricing: Pricing;
  try {
    pricing = await loadPricing(opts.pricingPath);
  } catch {
    return false; // sin pricing legible local: nada que chequear
  }
  const status = pricingAgeStatus(pricing, config.pricing.maxAgeDays);
  if (status.status === "fresh") return false;
  checkedThisSession = true;
  // Fire and forget: la ingesta nunca espera ni falla por la red.
  void (opts.run ?? runPricingUpdate)({ pricingPath: opts.pricingPath }).catch(() => {});
  return true;
}
