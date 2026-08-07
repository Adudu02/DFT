import { useState } from "react";
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
import { useApi } from "../hooks.js";
import { usd, compact, pct } from "../utils.js";
import { AMBER } from "../constants.js";
import type { Summary } from "../types.js";
import { Panel } from "../components/Panel.js";
import { Loading } from "../components/Loading.js";
import { ErrorMsg } from "../components/ErrorMsg.js";
import { Empty } from "../components/Empty.js";

export function Inicio() {
  const { data, error } = useApi<Summary>("/api/summary");
  const [mode, setMode] = useState<"subs" | "tokens">("subs");
  const [agentSel, setAgentSel] = useState<string>("todos");
  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Loading />;
  const s = data;
  const spark = s.daily.map((d) => ({ day: d.day.slice(5), v: mode === "subs" ? d.costUsd : d.input + d.output }));
  const agents = s.perAgent.map((a) => a.agent);
  const donutSrc = agentSel === "todos" ? s.perModel : (s.perAgentModels[agentSel] ?? []);
  const donut = donutSrc.filter((m) => m.costUsd > 0);

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
              <XAxis dataKey="day" tick={{ fill: "#948a78", fontSize: 10 }} interval="preserveStartEnd" />
              <Tooltip
                contentStyle={{ background: "#1c1a17", border: "1px solid #2a2622", color: "#e56b83" }}
                itemStyle={{ color: "#e56b83" }}
                labelStyle={{ color: "#e56b83" }}
                formatter={(v: number) => (mode === "subs" ? usd(v) : compact(v))}
              />
              <Line type="monotone" dataKey="v" stroke="#e56b83" strokeWidth={2} dot={false} isAnimationActive={false} />
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
              <span className={`flex-1 min-w-0 truncate ${m.known ? "" : "text-term-red"}`}>
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
        {agents.length > 0 && (
          <div className="flex flex-wrap text-xs border border-term-border rounded overflow-hidden mb-2 w-fit">
            {["todos", ...agents].map((a) => (
              <button
                key={a}
                onClick={() => setAgentSel(a)}
                className={`px-2 py-0.5 ${agentSel === a ? "bg-term-amber text-black" : "text-term-muted"}`}
              >
                {a === "todos" ? "TODOS" : a}
              </button>
            ))}
          </div>
        )}
        {donut.length > 0 ? (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="costUsd" nameKey="model" innerRadius={40} outerRadius={65} paddingAngle={2} isAnimationActive={false}>
                  {donut.map((_, i) => (
                    <Cell key={i} fill={AMBER[i % AMBER.length]} stroke="#121110" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#1c1a17", border: "1px solid #2a2622", color: "#e56b83" }}
                  itemStyle={{ color: "#e56b83" }}
                  labelStyle={{ color: "#e56b83" }}
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
