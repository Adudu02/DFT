import { useState } from "react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { useApi } from "../hooks.js";
import { usd, compact, pct } from "../utils.js";
import type { WasteReport, WasteFinding } from "../types.js";
import { Panel } from "../components/Panel.js";
import { Loading } from "../components/Loading.js";
import { ErrorMsg } from "../components/ErrorMsg.js";
import { Empty } from "../components/Empty.js";

const WASTE_TAG: Record<WasteFinding["kind"], string> = {
  "cache-miss": "CACHE",
  "session-bloat": "BLOAT",
  "model-mismatch": "MODEL",
};

const PAGE_SIZE = 20;

export function Ahorro() {
  const { data, error } = useApi<WasteReport>("/api/waste");
  const [visible, setVisible] = useState(PAGE_SIZE);
  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Loading />;
  const shown = data.findings.slice(0, visible);
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
                <XAxis dataKey="day" tick={{ fill: "#9ca3af", fontSize: 10 }} interval="preserveStartEnd" />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 8px 20px -8px rgba(15,23,42,0.18)", color: "#14161b" }}
                  itemStyle={{ color: "#16a34a" }}
                  labelStyle={{ color: "#6b7280" }}
                  formatter={(v: number) => usd(v)}
                />
                <Line type="monotone" dataKey="v" stroke="#16a34a" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="text-xs text-term-muted mt-1">tendencia: ahorro estimado por día de sesión</div>
      </Panel>
      {data.findings.length === 0 && <Empty msg="sin fugas con los umbrales actuales (ajustables en Configuración)" />}
      {shown.map((f) => (
        <Panel key={f.kind + f.sessionId}>
          <div className="flex justify-between items-baseline gap-2">
            <span className={`tag2 ${f.estUsd != null ? "bg-term-amber/10 text-term-amber" : "bg-term-border text-term-muted"}`}>
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
      {visible < data.findings.length && (
        <button type="button" className="btn justify-self-start" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
          Cargar más ({data.findings.length - visible} restantes)
        </button>
      )}
    </div>
  );
}
