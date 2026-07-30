/**
 * Anonimiza un transcript real de Claude Code para usarlo como fixture.
 * PRESERVA lo que el parser consume: type, message.model, message.id,
 * message.usage, requestId, timestamp, sessionId. SCRUB del resto de texto
 * (message.content, cwd, gitBranch, contenidos de user/attachment).
 *
 * Uso:  node scripts/anonymize.mjs <in.jsonl> <out.jsonl>
 * SOLO LECTURA sobre la fuente; escribe unicamente en <out.jsonl> (fixture).
 */
import { readFileSync, writeFileSync } from "node:fs";

const SCRUB = "[scrubbed]";

function scrubContent(content) {
  if (typeof content === "string") return SCRUB;
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (block && typeof block === "object") {
        const b = { type: block.type };
        // conservar solo la forma, no el texto
        if (block.type === "tool_use") b.name = SCRUB;
        return b;
      }
      return SCRUB;
    });
  }
  return content;
}

function anonymizeLine(line) {
  const o = JSON.parse(line);
  if ("cwd" in o) o.cwd = SCRUB;
  if ("gitBranch" in o) o.gitBranch = SCRUB;
  if ("content" in o && o.type !== "assistant") o.content = SCRUB;
  if (o.message) {
    if ("content" in o.message) o.message.content = scrubContent(o.message.content);
  }
  return JSON.stringify(o);
}

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("uso: node scripts/anonymize.mjs <in.jsonl> <out.jsonl>");
  process.exit(1);
}

const lines = readFileSync(inPath, "utf8").split("\n").filter(Boolean);
const out = lines
  .map((l) => {
    try {
      return anonymizeLine(l);
    } catch {
      return null; // descarta lineas corruptas
    }
  })
  .filter(Boolean)
  .join("\n");

writeFileSync(outPath, out + "\n");
console.error(`anonimizado ${lines.length} lineas -> ${outPath}`);
