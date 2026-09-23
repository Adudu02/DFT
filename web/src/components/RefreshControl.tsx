import { useCallback, useEffect, useState } from "react";
import { refreshAll } from "../hooks.js";
import { REFRESH_MS } from "../constants.js";

export function RefreshControl() {
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    setBusy(true);
    await refreshAll();
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(run, REFRESH_MS);
    return () => clearInterval(id);
  }, [auto, run]);

  return (
    <div className="flex items-center gap-2 text-xs whitespace-nowrap md:flex-col md:items-stretch md:gap-2">
      {busy && <span className="text-term-muted md:text-[11px]">actualizando…</span>}
      <div className="flex items-center gap-2">
        <button type="button"
          onClick={run}
          aria-label="Refrescar datos"
          disabled={busy}
          title="Reingerir transcripts y refrescar"
          className="w-7 h-7 flex items-center justify-center rounded-full border border-term-border text-term-amber hover:bg-term-amber/10 disabled:opacity-50"
        >
          ↻
        </button>
        <button type="button"
          onClick={() => setAuto((a) => !a)}
          aria-pressed={auto}
          title={`Auto-refresco cada ${REFRESH_MS / 1000}s`}
          className={`px-2.5 py-1 rounded-full border font-semibold ${
            auto ? "bg-term-green text-white border-term-green" : "border-term-border text-term-muted"
          }`}
        >
          AUTO
        </button>
      </div>
    </div>
  );
}
