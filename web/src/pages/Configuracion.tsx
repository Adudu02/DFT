import { useEffect, useState } from "react";
import { useApi } from "../hooks.js";
import type { Config, WasteThresholds } from "../types.js";
import { Panel } from "../components/Panel.js";
import { Loading } from "../components/Loading.js";
import { Field } from "../components/Field.js";

export function Configuracion() {
  const [key, setKey] = useState(0);
  const { data: cfg } = useApi<Config>("/api/config", key);
  const { data: pricing } = useApi<unknown>("/api/pricing", key);
  const { data: pricingStatus } = useApi<{ status: string; ageDays: number | null; maxAgeDays: number; verifiedAt: string | null }>(
    "/api/pricing-status",
    key,
  );
  const [form, setForm] = useState<Config | null>(null);
  const [downgradeText, setDowngradeText] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [pricingText, setPricingText] = useState<string>("");
  const [pricingJsonError, setPricingJsonError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (cfg) {
      setForm(cfg);
      setDowngradeText(JSON.stringify(cfg.waste.downgradePaths, null, 2));
      setJsonError(null);
    }
  }, [cfg]);
  useEffect(() => {
    if (pricing) {
      setPricingText(JSON.stringify(pricing, null, 2));
      setPricingJsonError(null);
    }
  }, [pricing]);
  if (!form) return <Loading />;

  const saveConfig = async () => {
    const response = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const result = await response.json();
    setFailed(!response.ok);
    setMsg(response.ok ? "configuración guardada" : `error: ${result.error ?? "configuración inválida"}`);
    if (response.ok && result.config) setForm(result.config);
  };
  const editPricing = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setPricingText(text);
    try {
      JSON.parse(text);
      setPricingJsonError(null);
    } catch (err) {
      setPricingJsonError(String(err));
    }
  };
  const savePricing = async () => {
    try {
      const body = JSON.parse(pricingText);
      const r = await fetch("/api/pricing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      setFailed(!r.ok);
      setMsg(j.ok ? "pricing guardado — corre rebuild para recalcular" : `error: ${j.error}`);
    } catch (e) {
      setFailed(true);
      setMsg(`JSON inválido: ${String(e)}`);
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

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Parámetros">
        <Field label="Tarifa por hora (USD)">
          <input type="number" value={form.hourlyRate} onChange={num("hourlyRate")} className="in" />
        </Field>
        <Field label="Umbral obsolescencia (días)">
          <input type="number" value={form.staleDays} onChange={num("staleDays")} className="in" />
        </Field>
        <Field label="Zona horaria (IANA, vacío = la del sistema)">
          <input
            type="text"
            placeholder="America/Merida"
            value={form.timeZone}
            onChange={(e) => setForm({ ...form, timeZone: e.target.value })}
            className="in"
          />
        </Field>
        <Field label="Minutos por uso (default)">
          <input type="number" value={form.minutesPerUseDefault} onChange={num("minutesPerUseDefault")} className="in" />
        </Field>
        <h3 className="text-term-muted text-xs uppercase tracking-widest mt-3 mb-2">Fugas (Ahorro)</h3>
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
        <h3 className="text-term-muted text-xs uppercase tracking-widest mt-3 mb-2">Downgrade paths (modelo caro → destino)</h3>
        <textarea
          value={downgradeText}
          onChange={editDowngrade}
          spellCheck={false}
          className={`w-full h-48 bg-term-bg border rounded p-2 text-xs font-mono text-term-amber ${
            jsonError ? "border-term-red" : "border-term-border"
          }`}
        />
        {jsonError && <div className="text-xs text-term-red mt-1">JSON inválido: {jsonError}</div>}
        <div className="text-xs text-term-muted">Cada entrada mapea un modelo caro a su destino de downgrade para turnos triviales.</div>
        <h3 className="text-term-muted text-xs uppercase tracking-widest mt-3 mb-2">Rutas de agentes</h3>
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
        <button type="button" onClick={saveConfig} disabled={jsonError !== null} className="btn mt-2 disabled:opacity-50 disabled:cursor-not-allowed">
          Guardar configuración
        </button>
      </Panel>

      <Panel title="pricing.json">
        {pricingStatus && pricingStatus.status !== "fresh" && (
          <div className="text-xs text-term-red border border-term-red rounded p-2 mb-3">
            ⚠ Precios {pricingStatus.status === "stale"
              ? `desactualizados (${pricingStatus.ageDays ?? "?"}d · TTL ${pricingStatus.maxAgeDays}d)`
              : "sin fecha de verificación"}
            {" "}— actualizalos con <code>pnpm pricing:update</code>
          </div>
        )}
        <textarea
          value={pricingText}
          onChange={editPricing}
          spellCheck={false}
          className={`w-full h-64 bg-term-bg border rounded p-2 text-xs font-mono text-term-amber ${
            pricingJsonError ? "border-term-red" : "border-term-border"
          }`}
        />
        {pricingJsonError && <div className="text-xs text-term-red mt-1">JSON inválido: {pricingJsonError}</div>}
        <div className="flex gap-2 mt-2">
          <button type="button" onClick={savePricing} disabled={pricingJsonError !== null} className="btn disabled:opacity-50 disabled:cursor-not-allowed">
            Guardar pricing
          </button>
          <button type="button" onClick={rebuild} className="btn">
            Rebuild
          </button>
        </div>
      </Panel>

      {msg && <div className={`md:col-span-2 text-xs ${failed ? "text-term-red" : "text-term-green"}`}>{msg}</div>}
    </div>
  );
}
