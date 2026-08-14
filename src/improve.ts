/**
 * Auto-corrección dirigida por reportes (PLAN §5). Lee el último reporte en
 * ./data/reports y lanza Claude Code SOBRE ESTE REPO (nunca sobre ~/.claude) con
 * un prompt derivado de los hallazgos, para intentar corregir los
 * parsers/heurísticas que fallaron y añadir tests. Es una pasada dirigida por un
 * humano (no un loop autónomo que itere hasta verde). Las fuentes jamás se tocan:
 * lo único que se mejora es el código del dashboard.
 *
 *   pnpm improve          # lanza Claude Code con el prompt
 *   pnpm improve -- --dry # solo imprime el prompt (no lanza nada)
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { latestReport, hasFindings, type IngestReport } from "motor-agentico-core";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function buildPrompt(reportPath: string, r: IngestReport): string {
  const findings = [
    r.unparseableLines > 0 && `- ${r.unparseableLines} líneas de transcript no se pudieron parsear (JSON corrupto o formato inesperado).`,
    r.unknownModels.length > 0 && `- Modelos sin tarifa (costo 0): ${r.unknownModels.join(", ")}. Verifica si son reales y añádelos a data/pricing.json, o ajusta el mapeo.`,
    r.adaptersWithoutData.length > 0 && `- Adapters sin datos: ${r.adaptersWithoutData.join(", ")}. Revisa las rutas de descubrimiento.`,
  ].filter(Boolean);

  return [
    "Eres un desarrollador senior mejorando el motor de ingesta de este repo (motor-agentico).",
    `Lee el último reporte de ingesta en ${reportPath}. Hallazgos:`,
    ...findings,
    "",
    "REGLA NO NEGOCIABLE: ~/.claude y cualquier directorio de fuentes son SOLO LECTURA.",
    "No toques las fuentes; solo mejora los parsers/heurísticas del dashboard en src/.",
    "",
    "Tarea:",
    "1. Diagnostica la causa de cada hallazgo (mira src/adapters/claude-code.ts y src/lib/).",
    "2. Corrige el código para cubrir esos casos.",
    "3. Añade tests en test/ (con fixtures anonimizados si hace falta) que cubran los casos nuevos.",
    "4. Corre `pnpm test` y `pnpm typecheck` y deja todo en verde.",
  ].join("\n");
}

const report = await latestReport();
if (!report) {
  console.error("No hay reportes en ./data/reports. Corre primero `pnpm rebuild` o `pnpm serve`.");
  process.exit(1);
}

if (!hasFindings(report.report)) {
  console.log(`Último reporte (${report.path}) sin hallazgos: nada que mejorar. ✔`);
  process.exit(0);
}

const prompt = buildPrompt(report.path, report.report);
const dry = process.argv.slice(2).some((a) => a === "--dry" || a === "--print");

console.log("─".repeat(60));
console.log(prompt);
console.log("─".repeat(60));

if (dry) process.exit(0);

// Lanza Claude Code sobre este repo con el prompt como mensaje inicial.
const child = spawn("claude", [prompt], { cwd: repoRoot, stdio: "inherit" });
child.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "ENOENT") {
    console.error(
      "\nNo se encontró el binario `claude` en el PATH. Copia el prompt de arriba y córrelo manualmente,\n" +
        "o instala Claude Code. (Usa `pnpm improve -- --dry` para solo ver el prompt.)",
    );
    process.exit(127);
  }
  console.error(err);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
