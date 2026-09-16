import { useState } from "react";
import { useApi } from "../hooks.js";
import { usd } from "../utils.js";
import type { SkillRow } from "../types.js";
import { Panel } from "../components/Panel.js";
import { Loading } from "../components/Loading.js";
import { ErrorMsg } from "../components/ErrorMsg.js";
import { Empty } from "../components/Empty.js";

export function Skills() {
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
        <div className="grid gap-1 min-w-0">
          {Object.entries(data.categories).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
            <div key={c} className="flex items-center gap-2 text-xs">
              <span className="w-20 text-term-muted">{c}</span>
              <div className="flex-1 bg-term-bg rounded-full h-3 overflow-hidden">
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
          <button type="button"
            key={c}
            onClick={() => setFilter(c)}
            className={`chip ${filter === c ? "active" : ""}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((s) => (
          <div
            key={s.name}
            className={`card2 p-3 ${s.uses === 0 ? "opacity-40" : ""}`}
          >
            <div className="flex justify-between items-baseline">
              <span className="text-term-amber font-bold truncate">/{s.name}</span>
              <span className="text-xs text-term-muted">{s.category}</span>
            </div>
            <div className="flex justify-between text-xs mt-2 text-term-muted">
              <span>{s.uses} usos</span>
              <span>{s.lastUsed ? s.lastUsed.slice(0, 10) : "sin uso"}</span>
            </div>
            {s.agents.length > 0 && (
              <div className="mt-2 text-xs text-term-muted">
                <span className="uppercase tracking-wider">Por IA: </span>
                {s.agents.map((a) => `${a.agent} · ${a.uses} usos · ${usd(a.savedUsd)}`).join("  |  ")}
              </div>
            )}
            {s.availableTo.length > 0 && <div className="mt-1 text-xs text-term-muted">Disponible en: {s.availableTo.join(" · ")}</div>}
            <div className="mt-1 text-term-green text-sm">{usd(s.savedUsd)} ahorrado</div>
          </div>
        ))}
        {skills.length === 0 && <Empty />}
      </div>
    </div>
  );
}
