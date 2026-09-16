import { useApi } from "../hooks.js";
import type { MemoryGraph, MemNode } from "../types.js";
import { Panel } from "../components/Panel.js";
import { Loading } from "../components/Loading.js";
import { ErrorMsg } from "../components/ErrorMsg.js";
import { Empty } from "../components/Empty.js";
import { Legend } from "../components/Legend.js";

export function Memoria() {
  const { data, error } = useApi<MemoryGraph>("/api/memory");
  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Loading />;
  const W = 800;
  const H = 460;
  const cx = W / 2;
  const cy = H / 2;
  const ringR: Record<MemNode["kind"], number> = { project: 0, index: 70, memory: 150, session: 210 };

  const byKind = new Map<string, MemNode[]>();
  for (const n of data.nodes) byKind.set(n.kind, [...(byKind.get(n.kind) ?? []), n]);
  const pos = new Map<string, { x: number; y: number }>();
  for (const [kind, nodes] of byKind) {
    const r = ringR[kind as MemNode["kind"]] ?? 180;
    nodes.forEach((n, i) => {
      if (r === 0) {
        pos.set(n.id, { x: cx, y: cy });
      } else {
        const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        pos.set(n.id, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
    });
  }
  const now = Date.now();
  const glow = (n: MemNode) => {
    if (!n.lastTouched) return 0.4;
    const days = (now - new Date(n.lastTouched).getTime()) / 86_400_000;
    return Math.max(0.3, 1 - days / 30);
  };
  const color = (n: MemNode) =>
    n.stale ? "#f59e0b" : n.kind === "session" ? "#06b6d4" : n.kind === "index" ? "#16a34a" : n.kind === "project" ? "#8b5cf6" : "#4c6ef5";

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="text-lg">
          <span className="text-term-amber font-bold">{data.counts.memories}</span> memorias ·{" "}
          <span className="text-term-red font-bold">{data.counts.stale}</span> obsoletas
        </div>
      </Panel>
      <Panel>
        {data.nodes.length === 0 ? (
          <Empty msg="sin archivos de memoria en ~/.claude/projects/*/memory" />
        ) : (
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }} role="img" aria-label="Grafo de memoria del proyecto">
              <title>Grafo de memoria del proyecto</title>
              <desc>Nodos de archivos de memoria enlazados a su sesión de origen; los obsoletos se destacan.</desc>
              {data.links.map((l, i) => {
                const a = pos.get(l.source);
                const b = pos.get(l.target);
                if (!a || !b) return null;
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#e5e7eb" strokeWidth={1} />;
              })}
              {data.nodes.map((n) => {
                const p = pos.get(n.id)!;
                const r = n.kind === "project" ? 10 : n.kind === "memory" ? 7 : 5;
                return (
                  <g key={n.id} opacity={glow(n)}>
                    <circle cx={p.x} cy={p.y} r={r} fill={color(n)} stroke="#ffffff" strokeWidth={1.5} />
                    <text x={p.x + r + 2} y={p.y + 3} fill="#6b7280" fontSize={9}>
                      {n.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
        <Legend
          items={[
            ["#4c6ef5", "memoria"],
            ["#16a34a", "índice"],
            ["#06b6d4", "sesión"],
            ["#8b5cf6", "proyecto"],
            ["#f59e0b", "obsoleta"],
          ]}
        />
      </Panel>
    </div>
  );
}
