/**
 * Grafo de memoria (PLAN §4.3). Escanea ~/.claude/projects/<proj>/memory/*.md
 * (SOLO LECTURA). Nodos: memoria / índice (MEMORY.md) / sesión (origin) /
 * proyecto. Aristas: reference ([[wikilink]] o link md), origin
 * (originSessionId), contains (índice → memorias). Obsoleto = mtime > umbral.
 */
import type { Dirent } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { readFileRO, readDirRO } from "motor-agentico-core";
import { defaultProjectsRoot } from "motor-agentico-core";

const DAY_MS = 86_400_000;

export type NodeKind = "memory" | "index" | "session" | "project";

export interface MemNode {
  id: string; // path del archivo, o "session:x" / "project:x"
  label: string;
  kind: NodeKind;
  project: string;
  type?: string; // metadata.type de la memoria
  size?: number;
  lastTouched?: string;
  stale?: boolean;
}

export interface MemLink {
  source: string;
  target: string;
  rel: "reference" | "origin" | "contains";
}

export interface MemoryGraph {
  nodes: MemNode[];
  links: MemLink[];
  counts: { memories: number; stale: number };
}

const clean = (s: string) => s.trim().replace(/^["']|["']$/g, "");

interface FrontMatter {
  name?: string;
  description?: string;
  type?: string;
  originSessionId?: string;
}

function parseFrontmatter(raw: string): FrontMatter {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  const fm: FrontMatter = {};
  if (!m) return fm;
  let inMeta = false;
  for (const line of m[1].split("\n")) {
    const top = /^(\w[\w-]*):\s*(.*)$/.exec(line);
    if (top && !/^\s/.test(line)) {
      inMeta = top[1] === "metadata" && top[2].trim() === "";
      if (top[1] === "name") fm.name = clean(top[2]);
      else if (top[1] === "description") fm.description = clean(top[2]);
      continue;
    }
    if (inMeta) {
      const sub = /^\s+(\w[\w-]*):\s*(.*)$/.exec(line);
      if (sub?.[1] === "type") fm.type = clean(sub[2]);
      else if (sub?.[1] === "originSessionId") fm.originSessionId = clean(sub[2]);
    }
  }
  return fm;
}

export async function scanMemory(
  root: string = defaultProjectsRoot(),
  opts: { staleDays?: number; now?: number } = {},
): Promise<MemoryGraph> {
  const staleDays = opts.staleDays ?? 30;
  const now = opts.now ?? Date.now();
  const nodes: MemNode[] = [];
  const links: MemLink[] = [];
  const sessionIds = new Set<string>();

  let projects: Dirent[];
  try {
    projects = await readDirRO(root);
  } catch {
    return { nodes, links, counts: { memories: 0, stale: 0 } };
  }

  for (const p of projects) {
    if (!p.isDirectory()) continue;
    const memDir = join(root, p.name, "memory");
    let files: Dirent[];
    try {
      files = await readDirRO(memDir);
    } catch {
      continue; // proyecto sin memoria
    }
    const mdFiles = files.filter((f) => f.isFile() && f.name.endsWith(".md"));
    if (mdFiles.length === 0) continue;

    nodes.push({ id: `project:${p.name}`, label: p.name, kind: "project", project: p.name });

    // name -> path, para resolver [[wikilink]] dentro del proyecto.
    const byName = new Map<string, string>();
    const parsed: { path: string; raw: string; fm: FrontMatter; isIndex: boolean }[] = [];

    for (const f of mdFiles) {
      const path = join(memDir, f.name);
      const raw = await readFileRO(path);
      const fm = parseFrontmatter(raw);
      const isIndex = f.name === "MEMORY.md";
      const name = fm.name ?? basename(f.name, ".md");
      byName.set(name, path);
      parsed.push({ path, raw, fm, isIndex });

      const st = await stat(path);
      const stale = now - st.mtimeMs > staleDays * DAY_MS;
      nodes.push({
        id: path,
        label: name,
        kind: isIndex ? "index" : "memory",
        project: p.name,
        type: fm.type,
        size: st.size,
        lastTouched: new Date(st.mtimeMs).toISOString(),
        stale,
      });

      if (fm.originSessionId) {
        const sid = `session:${fm.originSessionId}`;
        if (!sessionIds.has(sid)) {
          sessionIds.add(sid);
          nodes.push({ id: sid, label: fm.originSessionId, kind: "session", project: p.name });
        }
        links.push({ source: path, target: sid, rel: "origin" });
      }
    }

    for (const { path, raw, isIndex } of parsed) {
      if (isIndex) {
        // Índice: link markdown [texto](archivo.md) => contains.
        for (const m of raw.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)) {
          const target = join(memDir, m[1]);
          if (byName.size && [...byName.values()].includes(target)) {
            links.push({ source: path, target, rel: "contains" });
          }
        }
      } else {
        // Memoria: [[nombre]] => reference al archivo de ese nombre.
        for (const m of raw.matchAll(/\[\[([^\]]+)\]\]/g)) {
          const target = byName.get(clean(m[1]));
          if (target && target !== path) links.push({ source: path, target, rel: "reference" });
        }
      }
    }
  }

  const memoryNodes = nodes.filter((n) => n.kind === "memory");
  return {
    nodes,
    links,
    counts: { memories: memoryNodes.length, stale: memoryNodes.filter((n) => n.stale).length },
  };
}
