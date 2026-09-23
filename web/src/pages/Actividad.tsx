import { useEffect, useState } from "react";
import { useApi } from "../hooks.js";
import { usd, compact } from "../utils.js";
import type { ActivityDay, ActivityPage, PromptSearchResult, SessionDetail, SessionTurn } from "../types.js";
import { Panel } from "../components/Panel.js";
import { Loading } from "../components/Loading.js";
import { ErrorMsg } from "../components/ErrorMsg.js";
import { Empty } from "../components/Empty.js";

// Hora | Prompt | Modelo · esfuerzo | In | Out | Costo. En móvil el prompt ocupa su propia fila.
const TURN_GRID =
  "grid grid-cols-[3rem_1fr_3.5rem_3.5rem_3.5rem] sm:grid-cols-[3rem_minmax(0,1fr)_9rem_3.5rem_3.5rem_3.5rem] gap-x-2 items-baseline";

function PromptRow({ t }: { t: SessionTurn }) {
  const [open, setOpen] = useState(false);
  // Tolera respuestas de un servidor anterior sin el desglose (models/in/out ausentes).
  const models = t.models ?? [];
  const [model, ...rest] = models;
  const input = t.inputTokens ?? t.tokens;
  return (
    <button type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className={`${TURN_GRID} w-full text-left min-w-0 rounded-md px-1 -mx-1 py-0.5 hover:bg-term-bg focus:outline-none focus:ring-1 focus:ring-term-amber`}
    >
      <span className="text-term-green font-mono" title={t.ts}>
        {t.time}
      </span>
      <span className={`col-span-5 sm:col-span-1 order-last sm:order-none min-w-0 text-term-muted ${open ? "whitespace-pre-wrap break-words" : "truncate"}`}>
        {t.prompt}
      </span>
      <span className="min-w-0 truncate" title={[models.join(", "), t.effort && `esfuerzo: ${t.effort}`].filter(Boolean).join(" · ")}>
        {model ?? "—"}
        {rest.length > 0 && <span className="text-term-muted"> +{rest.length}</span>}
        {t.effort && <span className="block text-term-muted">{t.effort}</span>}
      </span>
      <span className="text-right" title={t.cacheTokens == null ? undefined : `caché ${compact(t.cacheTokens)} de ${compact(input)}`}>
        {compact(input)}
      </span>
      <span className="text-right">{t.outputTokens == null ? "—" : compact(t.outputTokens)}</span>
      <span className="text-term-amber text-right">{usd(t.costUsd)}</span>
    </button>
  );
}

function SessionDrill({ id }: { id: string }) {
  const { data } = useApi<SessionDetail>(`/api/session/${id}`);
  const { data: turns } = useApi<SessionTurn[]>(`/api/session/${id}/turns`);
  if (!data) return <div className="text-xs text-term-muted mt-2">cargando…</div>;
  return (
    <div className="mt-2 ml-2 text-xs min-w-0">
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

      {data.agent === "opencode" && turns && turns.length > 0 && (
        <div className="mt-2 text-term-muted" style={{ fontSize: 10 }}>
          Costo por turno de OpenCode = reparto parejo del total de la sesión (OpenCode no registra costo por turno).
        </div>
      )}

      {turns && turns.length > 0 && (
        <div className="mt-3 border-t border-term-border/50 pt-2">
          <div className={`${TURN_GRID} text-term-muted uppercase tracking-widest mb-1 px-1 -mx-1`} style={{ fontSize: 10 }}>
            <span>Hora</span>
            <span className="hidden sm:block">Prompts ({turns.length})</span>
            <span>Modelo</span>
            <span className="text-right">In</span>
            <span className="text-right">Out</span>
            <span className="text-right">Costo</span>
          </div>
          <div className="grid gap-1 min-w-0">
            {turns.map((t, i) => (
              <PromptRow key={i} t={t} />
            ))}
          </div>
        </div>
      )}
      {turns && turns.length === 0 && (
        <div className="mt-2 text-term-muted" style={{ fontSize: 10 }}>
          (sin prompts legibles — si la sesión es muy vieja, corré Rebuild)
        </div>
      )}
    </div>
  );
}

function mergeDays(previous: ActivityDay[], next: ActivityDay[]): ActivityDay[] {
  const days = new Map(previous.map((day) => [day.day, { ...day, sessions: [...day.sessions] }]));
  for (const day of next) {
    const current = days.get(day.day) ?? { day: day.day, sessions: [] };
    const ids = new Set(current.sessions.map((session) => session.id));
    current.sessions.push(...day.sessions.filter((session) => !ids.has(session.id)));
    days.set(day.day, current);
  }
  return [...days.values()].sort((a, b) => b.day.localeCompare(a.day));
}

export function Actividad() {
  const [filters, setFilters] = useState({ project: "", agent: "", model: "" });
  const [draft, setDraft] = useState(filters);
  const [cursor, setCursor] = useState<string | null>(null);
  const params = new URLSearchParams({ limit: "50" });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (cursor) params.set("cursor", cursor);
  const { data, error } = useApi<ActivityPage>(`/api/activity?${params}`);
  const [days, setDays] = useState<ActivityDay[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [promptQuery, setPromptQuery] = useState("");
  const [matches, setMatches] = useState<PromptSearchResult[]>([]);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    if (!data?.days) return;
    setDays((previous) => (cursor ? mergeDays(previous, data.days) : data.days));
  }, [data, cursor]);

  const applyFilters = () => {
    setDays([]);
    setCursor(null);
    setFilters(draft);
  };
  const search = async () => {
    setSearchError("");
    const searchParams = new URLSearchParams({ q: promptQuery, limit: "30" });
    for (const [key, value] of Object.entries(filters)) if (value) searchParams.set(key, value);
    const response = await fetch(`/api/activity/search?${searchParams}`);
    const result = await response.json();
    if (!response.ok) {
      setSearchError(result.error ?? "no se pudo buscar");
      setMatches([]);
      return;
    }
    setMatches(result.results);
  };
  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Loading />;
  return (
    <div className="grid gap-4 min-w-0">
      <Panel title="Filtros y exportación">
        <div className="grid gap-2 sm:grid-cols-4">
          {(["project", "agent", "model"] as const).map((field) => (
            <input key={field} className="in" placeholder={field} value={draft[field]} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} />
          ))}
          <button type="button" className="btn w-full sm:w-auto" onClick={applyFilters}>Aplicar filtros</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="btn" href="/api/export?format=csv" download>Descargar CSV</a>
          <a className="btn" href="/api/export?format=json" download>Descargar JSON</a>
        </div>
      </Panel>

      <Panel title="Buscar en prompts">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="in" value={promptQuery} onChange={(e) => setPromptQuery(e.target.value)} placeholder="Texto del prompt (solo lectura)" />
          <button type="button" className="btn w-full sm:w-auto" onClick={search}>Buscar</button>
        </div>
        {searchError && <div className="mt-2 text-xs text-term-red">{searchError}</div>}
        {matches.length > 0 && <div className="mt-3 grid gap-2 text-xs">{matches.map((match) => (
          <div key={`${match.id}-${match.prompt}`} className="border-b border-term-border/50 pb-2">
            <button type="button" className="text-left text-term-amber" onClick={() => setOpen(open === match.id ? null : match.id)}>{match.project}/{match.id.slice(0, 8)}</button>
            <div className="text-term-muted break-words">{match.prompt}</div>
            {open === match.id && <SessionDrill id={match.id} />}
          </div>
        ))}</div>}
      </Panel>

      {days.length === 0 && <Empty />}
      {days.map((d) => (
        <Panel key={d.day} title={d.day}>
          <div className="grid gap-2">
            {d.sessions.map((s) => (
              <div key={s.id} className="min-w-0 border-b border-term-border/50 pb-2 last:border-0">
                <button type="button" className="w-full min-w-0 text-left flex flex-col items-start gap-1 sm:flex-row sm:justify-between sm:items-center sm:gap-3" onClick={() => setOpen(open === s.id ? null : s.id)}>
                  <span className="w-full flex-1 min-w-0 truncate sm:w-auto" title={`${s.project}/${s.id}`}>
                    <span className="text-term-muted text-xs">{s.project}/</span>
                    <span className="text-term-amber">{s.id.slice(0, 8)}</span>
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-term-muted">
                    <span>{s.agent}</span>
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
      {data.nextCursor && <button type="button" className="btn justify-self-start" onClick={() => setCursor(data.nextCursor)}>Cargar más</button>}
    </div>
  );
}
