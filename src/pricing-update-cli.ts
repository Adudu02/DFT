/**
 * CLI `pnpm pricing:update`: actualiza data/pricing.json desde la DB curada
 * de LiteLLM con merge de overrides manuales (add-pricing-auto-updater).
 *   pnpm pricing:update           # reporte legible
 *   pnpm pricing:update -- --json # salida machine-readable
 * Exit ≠ 0 ante fallo (red, fuente inválida); el archivo queda intacto.
 */
import { runPricingUpdate } from "how-much-did-u-waste-core";
import { ensureUserData } from "how-much-did-u-waste-core";

const json = process.argv.includes("--json");
ensureUserData();
const report = await runPricingUpdate();

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else if (report.error) {
  console.error(`✗ ${report.error}`);
  console.error("  data/pricing.json quedó intacto. Reintentá con red disponible.");
} else {
  console.log(`✓ pricing actualizado (${report.updated.length} cambiados · ${report.added.length} añadidos · ${report.unchanged.length} sin cambios)`);
  if (report.added.length) console.log(`  añadidos: ${report.added.slice(0, 10).join(", ")}${report.added.length > 10 ? " …" : ""}`);
  if (report.missingRate.length) console.log(`  sin tarifa en la fuente (preservados locales): ${report.missingRate.join(", ")}`);
  console.log("  overrides: editá data/pricing-overrides.json (ver data/pricing-overrides.json.example)");
}
process.exit(report.error ? 1 : 0);
