import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

// ─────────────────────────── tipos (espejo del API) ───────────────────────────
interface ModelShare {
  model: string;
  costUsd: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  known: boolean;
  share: number;
}
interface AgentShare {
  agent: string;
  costUsd: number;
  tokens: number;
  share: number;
}
interface Summary {
  from?: string;
  to?: string;
  windowDays: number;
  totalCostUsd: number;
  totalTokens: number;
  daily: { day: string; costUsd: number; input: number; output: number }[];
  perModel: ModelShare[];
  perAgent: AgentShare[];
  activity: { turns: number; projects: number; deltaPct7d: number | null };
  streakDays: number;
  unknownModels: string[];
}
interface SkillRow {
  name: string;
  uses: number;
  lastUsed: string | null;
  category: string;
  savedUsd: number;
  minutesPerUse: number;
  inCatalog: boolean;
}
interface MemNode {
  id: string;
  label: string;
  kind: "memory" | "index" | "session" | "project";
  project: string;
  type?: string;
  lastTouched?: string;
  stale?: boolean;
}
interface MemLink {
  source: string;
  target: string;
  rel: string;
}
interface MemoryGraph {
  nodes: MemNode[];
  links: MemLink[];
  counts: { memories: number; stale: number };
}
interface ActSession {
  id: string;
  project: string;
  agent: string;
  turns: number;
  costUsd: number;
  models: string[];
}
interface ActivityDay {
  day: string;
  sessions: ActSession[];
}
interface SessionDetail {
  id: string;
  project: string;
  turns: number;
  totalCostUsd: number;
  models: { model: string; input: number; output: number; cacheWrite: number; cacheRead: number; costUsd: number }[];
}
interface WasteThresholds {
  minCacheRatio: number;
  minInputTokens: number;
  bloatTurns: number;
  bloatTokens: number;
  expensiveInputRate: number;
  trivialOutputTokens: number;
  mismatchMinTurns: number;
  downgradeModel: string;
}
interface Config {
  hourlyRate: number;
  staleDays: number;
  minutesPerUseDefault: number;
  minutesPerUse: Record<string, number>;
  agentPaths: Record<string, string>;
  waste: WasteThresholds;
}
interface WasteFinding {
  kind: "cache-miss" | "session-bloat" | "model-mismatch";
  sessionId: string;
  project: string;
  title: string;
  detail: string;
  estUsd?: number;
  estTokens?: number;
  metrics: { input: number; output: number; cacheWrite: number; cacheRead: number; turns: number; cacheHitRatio: number };
}
interface WasteTrendPoint {
  day: string;
  estUsd: number;
  findings: number;
}
interface WasteReport {
  findings: WasteFinding[];
  totalEstUsd: number;
  totalEstTokens: number;
  trend: WasteTrendPoint[];
  thresholds: WasteThresholds;
}

// ─────────────────────────── helpers ───────────────────────────
const usd = (n: number) => "$" + (n ?? 0).toFixed(2);
const compact = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n ?? 0);
const pct = (n: number) => (n * 100).toFixed(0) + "%";
const AMBER = ["#ffb000", "#b87a00", "#e5533c", "#7dd35f", "#8a7a55", "#c9922e", "#5f8fd3"];

function useApi<T>(path: string, reloadKey = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setError(null);
    fetch(path)
      .then((r) => r.json())
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [path, reloadKey]);
  return { data, error };
}

function Panel({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-term-panel border border-term-border rounded p-4 ${className}`}>
      {title && <div className="text-term-muted text-xs uppercase tracking-widest mb-2">{title}</div>}
      {children}
    </div>
  );
}

// ─────────────────────────── Inicio ───────────────────────────
function Inicio() {
  const { data, error } = useApi<Summary>("/api/summary");
  const [mode, setMode] = useState<"subs" | "tokens">("subs");
  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Loading />;
  const s = data;
  const spark = s.daily.map((d) => ({ day: d.day.slice(5), v: mode === "subs" ? d.costUsd : d.input + d.output }));
  const donut = s.perModel.filter((m) => m.costUsd > 0);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Panel className="md:col-span-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-term-muted text-xs uppercase tracking-widest">
            {mode === "subs" ? `Gasto equiv. API · ${s.windowDays}d` : `Tokens · ${s.windowDays}d`}
          </span>
          <div className="flex text-xs border border-term-border rounded overflow-hidden">
            <button
              onClick={() => setMode("subs")}
              className={`px-2 py-0.5 ${mode === "subs" ? "bg-term-amber text-black" : "text-term-muted"}`}
            >
              SUSCRIPCIÓN
            </button>
            <button
              onClick={() => setMode("tokens")}
              className={`px-2 py-0.5 ${mode === "tokens" ? "bg-term-amber text-black" : "text-term-muted"}`}
            >
              TOKENS·EQUIV-API
            </button>
          </div>
        </div>
        <div className="text-4xl font-bold text-term-amber">
          {mode === "subs" ? usd(s.totalCostUsd) : compact(s.totalTokens)}
        </div>
        <div className="text-term-muted text-xs mt-1">
          {s.from} → {s.to} · lo que habría costado a tarifa medida
        </div>
        <div className="h-24 mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spark} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fill: "#8a7a55", fontSize: 10 }} interval="preserveStartEnd" />
              <Tooltip
                contentStyle={{ background: "#141210", border: "1px solid #3a2f1a", color: "#ffb000" }}
                formatter={(v: number) => (mode === "subs" ? usd(v) : compact(v))}
              />
              <Line type="monotone" dataKey="v" stroke="#ffb000" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {s.unknownModels.length > 0 && (
          <div className="mt-2 text-xs text-term-red">⚠ {s.unknownModels.length} modelos sin tarifa (costo 0)</div>
        )}
      </Panel>

      <div className="grid gap-4">
        <Panel title="Actividad">
          <div className="text-3xl font-bold text-term-amber">{s.activity.turns}</div>
          <div className="text-xs text-term-muted">turnos totales</div>
          <div className="mt-2 flex gap-4 text-xs">
            <span className={s.activity.deltaPct7d != null && s.activity.deltaPct7d < 0 ? "text-term-red" : "text-term-green"}>
              {s.activity.deltaPct7d == null ? "—" : (s.activity.deltaPct7d >= 0 ? "▲" : "▼") + " " + Math.abs(s.activity.deltaPct7d).toFixed(0) + "% 7d"}
            </span>
            <span className="text-term-muted">{s.activity.projects} proyectos</span>
          </div>
        </Panel>
        <Panel title="Racha">
          <div className="text-3xl font-bold text-term-green">{s.streakDays}</div>
          <div className="text-xs text-term-muted">días activos consecutivos</div>
        </Panel>
      </div>

      <Panel title="Participación por modelo" className="md:col-span-2">
        <div className="grid gap-2">
          {s.perModel.map((m, i) => (
            <div key={m.model} className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full" style={{ background: AMBER[i % AMBER.length] }} />
              <span className={`flex-1 truncate ${m.known ? "" : "text-term-red"}`}>
                {m.model}
                {!m.known && " ·sin tarifa"}
              </span>
              <span className="text-term-muted w-12 text-right">{pct(m.share)}</span>
              <span className="w-20 text-right text-term-amber">
                {mode === "subs" ? usd(m.costUsd) : compact(m.input + m.output + m.cacheWrite + m.cacheRead)}
              </span>
            </div>
          ))}
          {s.perModel.length === 0 && <Empty />}
        </div>
      </Panel>

      <Panel title="Total">
        {donut.length > 0 ? (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="costUsd" nameKey="model" innerRadius={40} outerRadius={65} paddingAngle={2} isAnimationActive={false}>
                  {donut.map((_, i) => (
                    <Cell key={i} fill={AMBER[i % AMBER.length]} stroke="#0a0a0a" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#141210", border: "1px solid #3a2f1a", color: "#ffb000" }}
                  formatter={(v: number) => usd(v)}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty />
        )}
      </Panel>

      <Panel title="Participación por agente" className="md:col-span-3">
        <div className="grid gap-2">
          {s.perAgent.map((a, i) => (
            <div key={a.agent} className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full" style={{ background: AMBER[i % AMBER.length] }} />
              <span className="w-28 truncate">{a.agent}</span>
              <div className="flex-1 bg-term-bg rounded h-3 overflow-hidden">
                <div className="h-full bg-term-amber" style={{ width: `${a.share * 100}%` }} />
              </div>
              <span className="text-term-muted w-12 text-right">{pct(a.share)}</span>
              <span className="w-20 text-right">{compact(a.tokens)} tok</span>
              <span className="w-20 text-right text-term-amber">{a.costUsd > 0 ? usd(a.costUsd) : "—"}</span>
            </div>
          ))}
          {s.perAgent.length === 0 && <Empty />}
        </div>
      </Panel>
    </div>
  );
}

// ─────────────────────────── Skills ───────────────────────────
function Skills() {
  const { data, error } = useApi<{ skills: SkillRow[]; categories: Record<string, number> }>("/api/skills");
  const [filter, setFilter] = useState<string>("todas");
  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Loading />;
  const cats = ["todas", ...Object.keys(data.categories).sort()];
  const skills = data.skills.filter((s) => filter === "todas" || s.category === filter);
  const maxCat = Math.max(1, ...Object.values(data.categories));

  return (
    <div className="grid gap-4">
      <Panel title="Uso por categoría">
        <div className="grid gap-1">
          {Object.entries(data.categories).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
            <div key={c} className="flex items-center gap-2 text-xs">
              <span className="w-20 text-term-muted">{c}</span>
              <div className="flex-1 bg-term-bg rounded h-3 overflow-hidden">
                <div className="h-full bg-term-amber" style={{ width: `${(n / maxCat) * 100}%` }} />
              </div>
              <span className="w-8 text-right">{n}</span>
            </div>
          ))}
          {Object.keys(data.categories).length === 0 && <Empty />}
        </div>
      </Panel>

      <div className="flex gap-2 flex-wrap">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-3 py-1 text-xs rounded border ${
              filter === c ? "bg-term-amber text-black border-term-amber" : "border-term-border text-term-muted"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((s) => (
          <div
            key={s.name}
            className={`bg-term-panel border border-term-border rounded p-3 ${s.uses === 0 ? "opacity-40" : ""}`}
          >
            <div className="flex justify-between items-baseline">
              <span className="text-term-amber font-bold truncate">/{s.name}</span>
              <span className="text-xs text-term-muted">{s.category}</span>
            </div>
            <div className="flex justify-between text-xs mt-2 text-term-muted">
              <span>{s.uses} usos</span>
              <span>{s.lastUsed ? s.lastUsed.slice(0, 10) : "sin uso"}</span>
            </div>
            <div className="mt-1 text-term-green text-sm">{usd(s.savedUsd)} ahorrado</div>
          </div>
        ))}
        {skills.length === 0 && <Empty />}
      </div>
    </div>
  );
}

// ─────────────────────────── Memoria ───────────────────────────
// ponytail: layout determinista por anillos según el tipo de nodo, no un motor
// de física. Suficiente para leer el grafo; subir a react-force-graph si el
// número de nodos crece y hace falta interacción/zoom.
function Memoria() {
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
    n.stale ? "#e0c000" : n.kind === "session" ? "#5f8fd3" : n.kind === "index" ? "#7dd35f" : n.kind === "project" ? "#b87a00" : "#ffb000";

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
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }}>
              {data.links.map((l, i) => {
                const a = pos.get(l.source);
                const b = pos.get(l.target);
                if (!a || !b) return null;
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#3a2f1a" strokeWidth={1} />;
              })}
              {data.nodes.map((n) => {
                const p = pos.get(n.id)!;
                const r = n.kind === "project" ? 10 : n.kind === "memory" ? 7 : 5;
                return (
                  <g key={n.id} opacity={glow(n)}>
                    <circle cx={p.x} cy={p.y} r={r} fill={color(n)} stroke="#0a0a0a" strokeWidth={1} />
                    <text x={p.x + r + 2} y={p.y + 3} fill="#8a7a55" fontSize={9}>
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
            ["#ffb000", "memoria"],
            ["#7dd35f", "índice"],
            ["#5f8fd3", "sesión"],
            ["#b87a00", "proyecto"],
            ["#e0c000", "obsoleta"],
          ]}
        />
      </Panel>
    </div>
  );
}

// ─────────────────────────── Actividad ───────────────────────────
function Actividad() {
  const { data, error } = useApi<ActivityDay[]>("/api/activity");
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Loading />;
  return (
    <div className="grid gap-4">
      {data.length === 0 && <Empty />}
      {data.map((d) => (
        <Panel key={d.day} title={d.day}>
          <div className="grid gap-2">
            {d.sessions.map((s) => (
              <div key={s.id} className="border-b border-term-border/50 pb-2 last:border-0">
                <button className="w-full text-left flex justify-between items-center" onClick={() => setOpen(open === s.id ? null : s.id)}>
                  <span className="truncate">
                    <span className="text-term-muted text-xs">{s.project}/</span>
                    <span className="text-term-amber">{s.id.slice(0, 8)}</span>
                  </span>
                  <span className="flex gap-3 text-xs text-term-muted">
                    <span>{s.turns} turnos</span>
                    <span>{s.models.length} modelos</span>
                    <span className="text-term-amber">{usd(s.costUsd)}</span>
                  </span>
                </button>
                {open === s.id && <SessionDrill id={s.id} />}
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}

function SessionDrill({ id }: { id: string }) {
  const { data } = useApi<SessionDetail>(`/api/session/${id}`);
  if (!data) return <div className="text-xs text-term-muted mt-2">cargando…</div>;
  return (
    <div className="mt-2 ml-2 text-xs">
      {data.models.map((m) => (
        <div key={m.model} className="flex justify-between py-0.5">
          <span className="text-term-muted">{m.model}</span>
          <span className="flex gap-3">
            <span>in {compact(m.input)}</span>
            <span>out {compact(m.output)}</span>
            <span className="text-term-amber">{usd(m.costUsd)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────── Ahorro ───────────────────────────
// El resto del dashboard MIDE el gasto; esta página señala DÓNDE se fuga y qué
// hacer (objetivo del usuario: gastar menos). Umbrales en Configuración → waste.
const WASTE_TAG: Record<WasteFinding["kind"], string> = {
  "cache-miss": "CACHE",
  "session-bloat": "BLOAT",
  "model-mismatch": "MODEL",
};

function Ahorro() {
  const { data, error } = useApi<WasteReport>("/api/waste");
  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Loading />;
  return (
    <div className="grid gap-4">
      <Panel>
        <div className="text-term-muted text-xs uppercase tracking-widest mb-1">Ahorro estimado detectado</div>
        <div className="text-4xl font-bold text-term-green">{usd(data.totalEstUsd)}</div>
        <div className="text-xs text-term-muted mt-1">
          {data.findings.length} fugas · {compact(data.totalEstTokens)} tokens señalados · equiv-API a tarifa medida
        </div>
        {data.trend.length > 1 && (
          <div className="h-24 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend.map((p) => ({ day: p.day.slice(5), v: p.estUsd }))} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fill: "#8a7a55", fontSize: 10 }} interval="preserveStartEnd" />
                <Tooltip
                  contentStyle={{ background: "#141210", border: "1px solid #3a2f1a", color: "#7dd35f" }}
                  formatter={(v: number) => usd(v)}
                />
                <Line type="monotone" dataKey="v" stroke="#7dd35f" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="text-xs text-term-muted mt-1">tendencia: ahorro estimado por día de sesión</div>
      </Panel>
      {data.findings.length === 0 && <Empty msg="sin fugas con los umbrales actuales (ajustables en Configuración)" />}
      {data.findings.map((f) => (
        <Panel key={f.kind + f.sessionId}>
          <div className="flex justify-between items-baseline gap-2">
            <span className={`text-xs px-2 py-0.5 rounded ${f.estUsd != null ? "bg-term-amber text-black" : "bg-term-border text-term-amber"}`}>
              {WASTE_TAG[f.kind]}
            </span>
            <span className="text-term-green font-bold">{f.estUsd != null ? usd(f.estUsd) : "—"}</span>
          </div>
          <div className="mt-2 text-term-amber">{f.title}</div>
          <div className="text-xs text-term-muted mt-1">
            {f.project}/{f.sessionId.slice(0, 8)} · {f.metrics.turns} turnos · acierto caché {pct(f.metrics.cacheHitRatio)}
          </div>
          <div className="text-sm mt-2">{f.detail}</div>
        </Panel>
      ))}
    </div>
  );
}

// ─────────────────────────── Configuración ───────────────────────────
function Configuracion() {
  const [key, setKey] = useState(0);
  const { data: cfg } = useApi<Config>("/api/config", key);
  const { data: pricing } = useApi<unknown>("/api/pricing", key);
  const [form, setForm] = useState<Config | null>(null);
  const [pricingText, setPricingText] = useState<string>("");
  const [msg, setMsg] = useState<string>("");
  useEffect(() => {
    if (cfg) setForm(cfg);
  }, [cfg]);
  useEffect(() => {
    if (pricing) setPricingText(JSON.stringify(pricing, null, 2));
  }, [pricing]);
  if (!form) return <Loading />;

  const saveConfig = async () => {
    await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setMsg("configuración guardada");
  };
  const savePricing = async () => {
    try {
      const body = JSON.parse(pricingText);
      const r = await fetch("/api/pricing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      setMsg(j.ok ? "pricing guardado — corre rebuild para recalcular" : "error: " + j.error);
    } catch (e) {
      setMsg("JSON inválido: " + String(e));
    }
  };
  const rebuild = async () => {
    setMsg("reingiriendo…");
    const r = await fetch("/api/rebuild", { method: "POST" });
    const j = await r.json();
    setMsg(`rebuild: ${j.eventsInserted} eventos · ${j.memories} memorias`);
    setKey((k) => k + 1);
  };
  const num = (k: keyof Config) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: Number(e.target.value) });
  const numW = (k: keyof WasteThresholds) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, waste: { ...form.waste, [k]: Number(e.target.value) } });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Parámetros">
        <Field label="Tarifa por hora (USD)">
          <input type="number" value={form.hourlyRate} onChange={num("hourlyRate")} className="in" />
        </Field>
        <Field label="Umbral obsolescencia (días)">
          <input type="number" value={form.staleDays} onChange={num("staleDays")} className="in" />
        </Field>
        <Field label="Minutos por uso (default)">
          <input type="number" value={form.minutesPerUseDefault} onChange={num("minutesPerUseDefault")} className="in" />
        </Field>
        <div className="text-term-muted text-xs uppercase tracking-widest mt-3 mb-2">Fugas (Ahorro)</div>
        <Field label="Min. acierto de caché (0–1)">
          <input type="number" step="0.05" value={form.waste.minCacheRatio} onChange={numW("minCacheRatio")} className="in" />
        </Field>
        <Field label="Piso de input para señalar (tokens)">
          <input type="number" value={form.waste.minInputTokens} onChange={numW("minInputTokens")} className="in" />
        </Field>
        <Field label="Turnos para sesión inflada">
          <input type="number" value={form.waste.bloatTurns} onChange={numW("bloatTurns")} className="in" />
        </Field>
        <Field label="Tokens para sesión inflada">
          <input type="number" value={form.waste.bloatTokens} onChange={numW("bloatTokens")} className="in" />
        </Field>
        <Field label="Tarifa input desde la que es «caro»">
          <input type="number" step="0.5" value={form.waste.expensiveInputRate} onChange={numW("expensiveInputRate")} className="in" />
        </Field>
        <Field label="Salida trivial (tokens/turno)">
          <input type="number" value={form.waste.trivialOutputTokens} onChange={numW("trivialOutputTokens")} className="in" />
        </Field>
        <Field label="Min. turnos triviales para señalar">
          <input type="number" value={form.waste.mismatchMinTurns} onChange={numW("mismatchMinTurns")} className="in" />
        </Field>
        <Field label="Modelo destino del downgrade">
          <input
            type="text"
            value={form.waste.downgradeModel}
            onChange={(e) => setForm({ ...form, waste: { ...form.waste, downgradeModel: e.target.value } })}
            className="in"
          />
        </Field>
        <div className="text-term-muted text-xs uppercase tracking-widest mt-3 mb-2">Rutas de agentes</div>
        <Field label="Claude Code (vacío = ~/.claude/projects)">
          <input
            type="text"
            placeholder="~/.claude/projects"
            value={form.agentPaths["claude-code"] ?? ""}
            onChange={(e) => setForm({ ...form, agentPaths: { ...form.agentPaths, "claude-code": e.target.value } })}
            className="in"
          />
        </Field>
        <Field label="Codex (vacío = ~/.codex)">
          <input
            type="text"
            placeholder="~/.codex"
            value={form.agentPaths["codex"] ?? ""}
            onChange={(e) => setForm({ ...form, agentPaths: { ...form.agentPaths, codex: e.target.value } })}
            className="in"
          />
        </Field>
        <div className="text-xs text-term-muted">Tras cambiar rutas, corré Rebuild para reingestar.</div>
        <button onClick={saveConfig} className="btn mt-2">
          Guardar configuración
        </button>
      </Panel>

      <Panel title="pricing.json">
        <textarea
          value={pricingText}
          onChange={(e) => setPricingText(e.target.value)}
          spellCheck={false}
          className="w-full h-64 bg-term-bg border border-term-border rounded p-2 text-xs font-mono text-term-amber"
        />
        <div className="flex gap-2 mt-2">
          <button onClick={savePricing} className="btn">
            Guardar pricing
          </button>
          <button onClick={rebuild} className="btn">
            Rebuild
          </button>
        </div>
      </Panel>

      {msg && <div className="md:col-span-2 text-xs text-term-green">{msg}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3 text-xs">
      <span className="text-term-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

// ─────────────────────────── Ayuda ───────────────────────────
function Ayuda() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Conectar tus agentes (local)">
        <p className="text-sm text-term-muted mb-3">
          El dashboard <span className="text-term-green">lee tus transcripts locales en solo lectura</span>.
          No hay que iniciar sesión ni pegar ninguna clave: los costos se calculan
          desde los tokens que ya viven en tu disco.
        </p>
        <ol className="text-sm space-y-2 list-decimal ml-4">
          <li>
            <span className="text-term-amber">Detección automática.</span> Al arrancar
            (<code className="text-term-amber">npm run serve</code>) se ingieren solas:
            <ul className="ml-4 mt-1 text-term-muted list-disc">
              <li>Claude Code → <code>~/.claude/projects/**/*.jsonl</code></li>
              <li>Codex → <code>~/.codex/sessions/**</code> y <code>archived_sessions/</code></li>
            </ul>
          </li>
          <li>
            <span className="text-term-amber">Ruta distinta.</span> Si tus transcripts
            están en otro lado, ponelo en <span className="text-term-amber">Configuración → Rutas de agentes</span>{" "}
            (acepta <code>~/</code>) y corré <span className="text-term-amber">Rebuild</span>.
          </li>
          <li>
            <span className="text-term-amber">Modelo sin tarifa.</span> Un modelo nuevo
            aparece con costo 0 + aviso hasta que agregás su precio en{" "}
            <span className="text-term-amber">Configuración → pricing.json</span>. Nunca se estima en silencio.
          </li>
        </ol>
        <p className="text-xs text-term-muted mt-3">
          CLI equivalente: <code className="text-term-amber">npm run cli</code> (tabla de gasto) ·{" "}
          <code className="text-term-amber">npm run cli -- --waste</code> (fugas de tokens).
        </p>
      </Panel>

      <Panel title="Seguridad y claves API">
        <p className="text-sm text-term-muted mb-3">
          Programa <span className="text-term-green">local y de solo lectura</span>. Aun así,
          estas son las garantías concretas:
        </p>
        <ul className="text-sm space-y-2">
          <li>
            <span className="text-term-green">✓ Nunca pide ni almacena claves.</span> No necesita
            API keys: calcula el costo <em>equivalente API</em> desde conteos de tokens locales.
            Si algo te pide una clave, no es este programa.
          </li>
          <li>
            <span className="text-term-green">✓ Fuentes intactas.</span> Todo se abre con flag{" "}
            <code>'r'</code> (<code>fs-readonly.ts</code>): jamás crea, escribe ni trunca. Un test de
            integridad hashea el árbol de fuentes antes/después de ingerir y exige que no cambie.
          </li>
          <li>
            <span className="text-term-green">✓ Solo lee transcripts.</span> La búsqueda es una
            lista blanca (<code>rollout-*.jsonl</code>, <code>*.jsonl</code>, memoria <code>*.md</code>).
            Nunca abre <code>~/.codex/auth.json</code>, <code>.env</code> ni archivos de credenciales.
          </li>
          <li>
            <span className="text-term-green">✓ Guarda solo métricas.</span> En <code>./data/motor.db</code>
            van conteos de tokens, modelo y nombres de skills — no el texto de tus prompts.
          </li>
          <li>
            <span className="text-term-green">✓ Sin exposición de red.</span> El servidor bindea solo a{" "}
            <code>127.0.0.1:8081</code>. No lo pongas detrás de un proxy público ni lo expongas a la LAN;
            no tiene auth porque no está pensado para eso.
          </li>
        </ul>
        <p className="text-xs text-term-muted mt-3">
          Precios en <code>pricing.json</code> son list-price de terceros (jul-2026); reverificá contra
          las páginas oficiales cuando importe para dinero real.
        </p>
      </Panel>
    </div>
  );
}

// ─────────────────────────── shared ───────────────────────────
const Loading = () => <div className="text-term-muted text-sm animate-pulse">cargando…</div>;
const ErrorMsg = ({ msg }: { msg: string }) => <div className="text-term-red text-sm">error: {msg}</div>;
const Empty = ({ msg = "sin datos" }: { msg?: string }) => <div className="text-term-muted text-sm">{msg}</div>;
function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex gap-4 flex-wrap mt-3 text-xs text-term-muted">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────── App shell ───────────────────────────
const TABS = [
  ["Inicio", Inicio],
  ["Ahorro", Ahorro],
  ["Skills", Skills],
  ["Memoria", Memoria],
  ["Actividad", Actividad],
  ["Configuración", Configuracion],
  ["Ayuda", Ayuda],
] as const;

export default function App() {
  const [tab, setTab] = useState(0);
  const Active = useMemo(() => TABS[tab][1], [tab]);
  return (
    <div className="min-h-screen">
      <style>{`.in{width:100%;background:#0a0a0a;border:1px solid #3a2f1a;border-radius:4px;padding:6px 8px;color:#ffb000;font-family:inherit}
      .btn{background:#141210;border:1px solid #3a2f1a;border-radius:4px;padding:6px 12px;color:#ffb000;font-size:12px;cursor:pointer}
      .btn:hover{border-color:#ffb000}`}</style>
      <header className="border-b border-term-border px-4 py-3 flex items-center gap-4 sticky top-0 bg-term-bg z-10">
        <span className="text-term-amber font-bold">▎motor agéntico</span>
        <nav className="flex gap-1 text-sm">
          {TABS.map(([name], i) => (
            <button
              key={name}
              onClick={() => setTab(i)}
              className={`px-3 py-1 rounded ${i === tab ? "bg-term-amber text-black" : "text-term-muted hover:text-term-amber"}`}
            >
              {name}
            </button>
          ))}
        </nav>
      </header>
      <main className="p-4 max-w-6xl mx-auto">
        <Active />
      </main>
    </div>
  );
}
