/**
 * Auto-chequeo de pricing ligado a la ingesta (add-pricing-auto-updater,
 * adaptado al split core/insights): core provee las primitivas
 * (pricingAgeStatus, runPricingUpdate); insights orquesta porque es quien
 * conoce la config. Best-effort: máx. una vez por proceso, nunca bloquea la
 * ingesta y todo fallo degrada en silencio (offline sigue funcionando).
 */
import { dayInTz, loadPricing, pricingAgeStatus, runPricingUpdate, type Pricing, type PricingUpdateReport } from "how-much-did-u-waste-core";
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
  opts: {
    pricingPath?: string;
    run?: typeof runPricingUpdate;
    now?: () => Date;
    onDone?: (report: PricingUpdateReport) => void | Promise<void>;
  } = {},
): Promise<boolean> {
  if (!config.pricing.autoUpdate || checkedThisSession) return false;
  let pricing: Pricing;
  try {
    pricing = await loadPricing(opts.pricingPath);
  } catch {
    return false; // sin pricing legible local: nada que chequear
  }
  const status = pricingAgeStatus(pricing, config.pricing.maxAgeDays);
  const verified = pricing.verified_at;
  const currentDay = dayInTz((opts.now?.() ?? new Date()).toISOString(), config.timeZone);
  if (status.status === "fresh" && verified && !Number.isNaN(Date.parse(verified)) && dayInTz(verified, config.timeZone) === currentDay) return false;
  checkedThisSession = true;
  // Fire and forget: la ingesta nunca espera ni falla por la red.
  void (opts.run ?? runPricingUpdate)({ pricingPath: opts.pricingPath, source: config.pricing.source })
    .then(async (report) => {
      if (!report.error && opts.onDone) await opts.onDone(report);
    })
    .catch(() => {});
  return true;
}
