import { useState } from "react";
import { useApi } from "../hooks.js";
import { usd, compact } from "../utils.js";
import type { ActivityDay, SessionDetail, SessionTurn } from "../types.js";
import { Panel } from "../components/Panel.js";
import { Loading } from "../components/Loading.js";
import { ErrorMsg } from "../components/ErrorMsg.js";
import { Empty } from "../components/Empty.js";

function PromptRow({ t }: { t: SessionTurn }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className="w-full text-left flex gap-2 items-baseline min-w-0 rounded px-1 -mx-1 hover:bg-term-bg focus:outline-none focus:ring-1 focus:ring-term-amber"
    >
      <span className="text-term-green font-mono flex-none" title={t.ts}>
        {t.time}
      </span>
      <span className={`flex-1 min-w-0 text-term-muted ${open ? "whitespace-pre-wrap break-words" : "truncate"}`}>
        {t.prompt}
      </span>
      <span className="flex-none text-term-muted">{compact(t.tokens)}</span>
      <span className="flex-none text-term-amber w-14 text-right">{usd(t.costUsd)}</span>
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

      {turns && turns.length > 0 && (
        <div className="mt-3 border-t border-term-border/50 pt-2">
          <div className="text-term-muted uppercase tracking-widest mb-1" style={{ fontSize: 10 }}>
            Prompts ({turns.length}) · hora · costo
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
          (sin prompts legibles — si la sesión es vieja, corré Rebuild)
        </div>
      )}
    </div>
  );
}

export function Actividad() {
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
                <button className="w-full text-left flex justify-between items-center gap-3" onClick={() => setOpen(open === s.id ? null : s.id)}>
                  <span className="flex-1 min-w-0 truncate" title={`${s.project}/${s.id}`}>
                    <span className="text-term-muted text-xs">{s.project}/</span>
                    <span className="text-term-amber">{s.id.slice(0, 8)}</span>
                  </span>
                  <span className="flex-none flex gap-3 text-xs text-term-muted">
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
