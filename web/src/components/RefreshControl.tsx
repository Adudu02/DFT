import { useEffect, useState } from "react";
import { refreshAll } from "../hooks.js";
import { REFRESH_MS } from "../constants.js";

export function RefreshControl() {
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Date | null>(null);
  const [ago, setAgo] = useState(0);

  const run = async () => {
    setBusy(true);
    await refreshAll();
    setLast(new Date());
    setBusy(false);
  };

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(run, REFRESH_MS);
    return () => clearInterval(id);
  }, [auto]);

  useEffect(() => {
    const id = setInterval(() => setAgo((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [last]);
  useEffect(() => setAgo(0), [last]);

  return (
    <div className="ml-auto flex items-center gap-2 text-xs whitespace-nowrap">
      <span className="text-term-muted">
        {busy ? "actualizando…" : last ? `hace ${ago}s` : "sin refrescar"}
      </span>
      <button
        onClick={run}
        disabled={busy}
        title="Reingerir transcripts y refrescar"
        className="px-2 py-0.5 rounded border border-term-border text-term-amber hover:border-term-amber disabled:opacity-50"
      >
        ↻
      </button>
      <button
        onClick={() => setAuto((a) => !a)}
        title={`Auto-refresco cada ${REFRESH_MS / 1000}s`}
        className={`px-2 py-0.5 rounded border ${
          auto ? "bg-term-green text-black border-term-green" : "border-term-border text-term-muted"
        }`}
      >
        AUTO
      </button>
    </div>
  );
}
