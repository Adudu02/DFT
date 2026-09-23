import { useEffect, useState } from "react";
import { useApi } from "../hooks.js";
import type { Config, WasteThresholds } from "../types.js";
import { Panel } from "../components/Panel.js";
import { Loading } from "../components/Loading.js";
import { Field } from "../components/Field.js";

function formatPricingDate(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return date.toLocaleString("es-MX", { timeZone: timeZone || undefined });
  } catch {
    return value;
  }
}

export function Configuracion() {
  const [key, setKey] = useState(0);
  const { data: cfg } = useApi<Config>("/api/config", key, false);
  const { data: pricingStatus } = useApi<{ status: string; ageDays: number | null; maxAgeDays: number; verifiedAt: string | null }>(
    "/api/pricing-status",
    key,
  );
  const [form, setForm] = useState<Config | null>(null);
  const [downgradeText, setDowngradeText] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [failed, setFailed] = useState(false);
  const [pricingBusy, setPricingBusy] = useState(false);
  useEffect(() => {
    if (cfg) {
      setForm(cfg);
      setDowngradeText(JSON.stringify(cfg.waste.downgradePaths, null, 2));
      setJsonError(null);
    }
  }, [cfg]);
  if (!form) return <Loading />;

  const saveConfig = async () => {
    const response = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const result = await response.json();
    setFailed(!response.ok);
    setMsg(response.ok ? "configuración guardada" : `error: ${result.error ?? "configuración inválida"}`);
    if (response.ok && result.config) setForm(result.config);
  };
  const refreshPricing = async () => {
    setPricingBusy(true);
    setFailed(false);
    setMsg("");
    try {
      const response = await fetch("/api/pricing/refresh", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setFailed(true);
        setMsg(`error: ${result.report?.error ?? result.error ?? "no se pudieron actualizar los precios"}`);
      } else {
        const report = result.report;
        setMsg(`precios: ${report.updated.length} actualizados · ${report.added.length} nuevos · ${report.unchanged.length} sin cambios · ${report.missingRate.length} sin tarifa — corré Rebuild para recalcular costos`);
        setKey((k) => k + 1);
      }
    } catch (e) {
      setFailed(true);
      setMsg(`error: ${String(e)}`);
    } finally {
      setPricingBusy(false);
    }
  };
  const rebuild = async () => {
    setMsg("reingiriendo…");
    setFailed(false);
    const r = await fetch("/api/rebuild", { method: "POST" });
    const j = await r.json();
    setMsg(`rebuild: ${j.skillsInserted ?? 0} usos de skills · ${j.eventsInserted} eventos · ${j.memories} memorias`);
    setKey((k) => k + 1);
  };
  const num = (k: keyof Config) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: Number(e.target.value) });
  // Edición libre: el texto local manda; solo un parseo exitoso entra a `form`.
  const editDowngrade = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setDowngradeText(text);
    try {
      const paths = JSON.parse(text);
      setJsonError(null);
      setForm({ ...form, waste: { ...form.waste, downgradePaths: paths } });
    } catch (err) {
      setJsonError(String(err));
    }
  };
  const numW = (k: keyof WasteThresholds) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, waste: { ...form.waste, [k]: Number(e.target.value) } });
  const pricingLabel = pricingStatus?.status === "fresh"
    ? "actualizados"
    : pricingStatus?.status === "stale"
      ? `desactualizados (${pricingStatus.ageDays ?? "?"}d · TTL ${pricingStatus.maxAgeDays}d)`
      : "sin fecha de verificación";
  const pricingColor = pricingStatus?.status === "fresh"
    ? "text-term-green border-term-green/30 bg-term-green/5"
    : pricingStatus?.status === "stale"
      ? "text-term-red border-term-red/30 bg-term-red/5"
      : "text-term-muted border-term-border bg-term-bg";
  const verifiedAt = pricingStatus?.verifiedAt
    ? formatPricingDate(pricingStatus.verifiedAt, form.timeZone)
    : "sin fecha de verificación";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="grid gap-4 content-start">
        <Panel title="General">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Field label="Tarifa por hora (USD)">
              <input type="number" value={form.hourlyRate} onChange={num("hourlyRate")} className="in" />
            </Field>
            <Field label="Umbral obsolescencia (días)">
              <input type="number" value={form.staleDays} onChange={num("staleDays")} className="in" />
            </Field>
            <Field label="Minutos por uso (default)">
              <input type="number" value={form.minutesPerUseDefault} onChange={num("minutesPerUseDefault")} className="in" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Zona horaria (IANA, vacío = la del sistema)">
                <input
                  type="text"
                  placeholder="America/Merida"
                  value={form.timeZone}
                  onChange={(e) => setForm({ ...form, timeZone: e.target.value })}
                  className="in"
                />
              </Field>
            </div>
          </div>
        </Panel>

        <Panel title="Umbrales de fugas (Ahorro)">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4">
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
            <Field label="Tarifa input desde la que es «caro» (USD/1M tok)">
              <input type="number" step="0.5" value={form.waste.expensiveInputRate} onChange={numW("expensiveInputRate")} className="in" />
            </Field>
            <Field label="Salida trivial (tokens/turno)">
              <input type="number" value={form.waste.trivialOutputTokens} onChange={numW("trivialOutputTokens")} className="in" />
            </Field>
            <Field label="Min. turnos triviales para señalar">
              <input type="number" value={form.waste.mismatchMinTurns} onChange={numW("mismatchMinTurns")} className="in" />
            </Field>
          </div>
        </Panel>

        <Panel>
          <details>
            <summary className="kicker uppercase tracking-widest cursor-pointer select-none flex items-center gap-1.5 [&::-webkit-details-marker]:hidden hover:text-term-amber">
              <svg aria-hidden="true" viewBox="0 0 20 20" className="w-3 h-3 flex-none transition-transform details-chevron" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 5l6 5-6 5" />
              </svg>
              Downgrade paths (avanzado)
            </summary>
            <div className="mt-3">
              <textarea
                value={downgradeText}
                onChange={editDowngrade}
                spellCheck={false}
                className={`w-full h-48 bg-term-bg border rounded-lg p-2 text-xs font-mono text-term-amber ${
                  jsonError ? "border-term-red" : "border-term-border"
                }`}
              />
              {jsonError && <div className="text-xs text-term-red mt-1">JSON inválido: {jsonError}</div>}
              <div className="text-xs text-term-muted mt-1">Cada entrada mapea un modelo caro a su destino de downgrade para turnos triviales.</div>
            </div>
          </details>
        </Panel>

        <Panel title="Rutas de agentes">
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
              value={form.agentPaths.codex ?? ""}
              onChange={(e) => setForm({ ...form, agentPaths: { ...form.agentPaths, codex: e.target.value } })}
              className="in"
            />
          </Field>
          <Field label="Qwen (vacío = ~/.qwen)">
            <input
              type="text"
              placeholder="~/.qwen"
              value={form.agentPaths.qwen ?? ""}
              onChange={(e) => setForm({ ...form, agentPaths: { ...form.agentPaths, qwen: e.target.value } })}
              className="in"
            />
          </Field>
          <div className="text-xs text-term-muted">Tras cambiar rutas, corré Rebuild para reingestar.</div>
        </Panel>

        <button type="button" onClick={saveConfig} disabled={jsonError !== null} className="btn justify-self-start disabled:opacity-50 disabled:cursor-not-allowed">
          Guardar configuración
        </button>
      </div>

      <Panel title="Precios">
        <div className="grid gap-2 mb-3 text-xs">
          <span className={`w-fit rounded-full border px-2 py-1 ${pricingColor}`}>{pricingLabel}</span>
          <div className="text-term-muted">Verificado: {verifiedAt} · Fuente: {cfg?.pricing.source ?? "litellm"}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={refreshPricing} disabled={pricingBusy} className="btn disabled:opacity-50 disabled:cursor-not-allowed">
            {pricingBusy ? "actualizando precios…" : "Actualizar precios ahora"}
          </button>
          <button type="button" onClick={rebuild} className="btn">Rebuild</button>
        </div>
      </Panel>

      {msg && <div className={`md:col-span-2 text-xs ${failed ? "text-term-red" : "text-term-green"}`}>{msg}</div>}
    </div>
  );
}
