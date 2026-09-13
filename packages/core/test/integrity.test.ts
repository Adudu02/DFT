/**
 * F6 — test de humo de integridad (PLAN §0.3, criterio §7): las fuentes son
 * SOLO LECTURA. Se hashea el árbol de fuentes (path + tamaño + mtime) antes y
 * después de un ciclo completo de ingesta y se exige que nada haya cambiado.
 *
 * Nota: se ingesta desde un árbol de fuentes temporal, no desde ~/.claude real,
 * porque una sesión de Claude Code viva estaría escribiendo su propio
 * transcript ahí (flaky). El árbol temporal ejerce el mismo camino de ingesta
 * (parseTranscript + scanMemory) y prueba que el código nunca escribe la fuente.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../src/lib/db.js";
import { ingestAll } from "../src/ingest.js";
import { loadPricing } from "../src/lib/pricing.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);

/** Firma recursiva del árbol: relpath|size|mtimeMs por archivo, orden estable. */
function hashTree(dir: string): string {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const st = statSync(p);
        out.push(`${relative(dir, p)}|${st.size}|${st.mtimeMs}`);
      }
    }
  };
  walk(dir);
  return out.join("\n");
}

let tmp: string;
let sources: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "motor-integ-"));
  // Árbol de fuentes: transcripts + memoria (ambos caminos de ingesta).
  sources = join(tmp, "sources");
  const proj = join(sources, "projA");
  const mem = join(proj, "memory");
  mkdirSync(mem, { recursive: true });
  copyFileSync(fx("deterministic.jsonl"), join(proj, "s1.jsonl"));
  copyFileSync(fx("skills.jsonl"), join(proj, "s2.jsonl"));
  writeFileSync(
    join(mem, "a.md"),
    `---\nname: a\ndescription: uno\nmetadata:\n  type: project\n---\n\nvéase [[b]].\n`,
  );
  writeFileSync(join(mem, "b.md"), `---\nname: b\ndescription: dos\nmetadata:\n  type: feedback\n---\n\nb.\n`);
  writeFileSync(join(mem, "MEMORY.md"), `# Memory Index\n- [a](a.md) — uno\n- [b](b.md) — dos\n`);
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("integridad read-only de las fuentes", () => {
  it("un ciclo de ingesta no altera el árbol de fuentes (hash idéntico)", async () => {
    const before = hashTree(sources);

    // La DB vive fuera de `sources` para que sus escrituras no cuenten.
    const db = openDb(join(tmp, "motor.db"));
    const summary = await ingestAll(db, { projectsRoot: sources, pricing: await loadPricing() });
    db.close();

    // Sanity: la ingesta realmente corrió sobre las fuentes.
    expect(summary.eventsInserted).toBeGreaterThan(0);

    expect(hashTree(sources)).toBe(before);
  });
});
