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

export function Ahorro() {
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
                <XAxis dataKey="day" tick={{ fill: "#948a78", fontSize: 10 }} interval="preserveStartEnd" />
                <Tooltip
                  contentStyle={{ background: "#1c1a17", border: "1px solid #2a2622", color: "#7dd35f" }}
                  itemStyle={{ color: "#7dd35f" }}
                  labelStyle={{ color: "#7dd35f" }}
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
