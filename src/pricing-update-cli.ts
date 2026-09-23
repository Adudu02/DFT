/**
 * CLI `pnpm pricing:update`: actualiza data/pricing.json desde la fuente
 * configurada (LiteLLM o models.dev) con merge de overrides manuales.
 *   pnpm pricing:update           # reporte legible
 *   pnpm pricing:update -- --json # salida machine-readable
 *   pnpm pricing:update -- --source modelsdev # elegir fuente para esta ejecución
 * Exit ≠ 0 ante fallo (red, fuente inválida); el archivo queda intacto.
 */
import { runPricingUpdate } from "how-much-did-u-waste-core";
import { ensureUserData } from "how-much-did-u-waste-core";
import { loadConfig } from "how-much-did-u-waste-insights";

const json = process.argv.includes("--json");
const sourceIndex = process.argv.indexOf("--source");
const sourceArg = sourceIndex < 0 ? undefined : process.argv[sourceIndex + 1];
const sourceOverride = sourceArg === "litellm" || sourceArg === "modelsdev" ? sourceArg : undefined;
if (sourceIndex >= 0 && sourceOverride === undefined) {
  console.error("✗ --source debe ser litellm o modelsdev");
  process.exit(1);
}
ensureUserData();
const config = await loadConfig();
const source = sourceOverride ?? config.pricing.source;
const report = await runPricingUpdate({ source });

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
