import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanMemory } from "../src/lib/memory.js";

let tmp: string;
let root: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "motor-mem-"));
  root = join(tmp, "projects");
  const mem = join(root, "projX", "memory");
  mkdirSync(mem, { recursive: true });
  writeFileSync(
    join(mem, "a.md"),
    `---\nname: a\ndescription: uno\nmetadata:\n  node_type: memory\n  type: project\n  originSessionId: sess-1\n---\n\nvéase [[b]] para detalles.\n`,
  );
  writeFileSync(
    join(mem, "b.md"),
    `---\nname: b\ndescription: dos\nmetadata:\n  type: feedback\n---\n\ncontenido b.\n`,
  );
  writeFileSync(join(mem, "MEMORY.md"), `# Memory Index\n- [a](a.md) — uno\n- [b](b.md) — dos\n`);
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("scanMemory", () => {
  it("cuenta memorias y arma nodos por tipo", async () => {
    const g = await scanMemory(root);
    expect(g.counts.memories).toBe(2);
    const kinds = g.nodes.reduce<Record<string, number>>((a, n) => ({ ...a, [n.kind]: (a[n.kind] ?? 0) + 1 }), {});
    expect(kinds.memory).toBe(2);
    expect(kinds.index).toBe(1);
    expect(kinds.session).toBe(1); // sess-1 (origin)
    expect(kinds.project).toBe(1);
    const a = g.nodes.find((n) => n.label === "a")!;
    expect(a.type).toBe("project");
  });

  it("arista reference por wikilink [[b]] y arista origin por originSessionId", async () => {
    const g = await scanMemory(root);
    const ref = g.links.find((l) => l.rel === "reference");
    expect(ref?.source.endsWith("a.md")).toBe(true);
    expect(ref?.target.endsWith("b.md")).toBe(true);
    expect(g.links.some((l) => l.rel === "origin" && l.target === "session:sess-1")).toBe(true);
  });

  it("índice MEMORY.md contiene a las memorias del proyecto", async () => {
    const g = await scanMemory(root);
    const contains = g.links.filter((l) => l.rel === "contains" && l.source.endsWith("MEMORY.md"));
    expect(contains.length).toBe(2);
  });

  it("obsoleto: stale=true si mtime supera el umbral", async () => {
    const fresh = await scanMemory(root, { staleDays: 30 });
    expect(fresh.counts.stale).toBe(0);
    // simula 'ahora' 40 días en el futuro: los archivos recién creados quedan obsoletos.
    const future = Date.now() + 40 * 86_400_000;
    const aged = await scanMemory(root, { staleDays: 30, now: future });
    expect(aged.counts.stale).toBe(2);
  });
});
