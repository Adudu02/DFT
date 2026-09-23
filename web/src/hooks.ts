// Hooks y sistema de refresco global.

import { useEffect, useState, useSyncExternalStore } from "react";

// ── refresco global ──────────────────────────────────────────────────────────
// Un "tick" externo al que se suscriben todos los useApi: al incrementarlo, cada
// panel vuelve a pedir sus datos sin recargar la página.
let tick = 0;
const tickListeners = new Set<() => void>();
const subscribeTick = (l: () => void) => {
  tickListeners.add(l);
  return () => void tickListeners.delete(l);
};
const getTick = () => tick;

function bumpTick() {
  tick++;
  for (const l of tickListeners) l();
}

/** Reingesta incremental en el servidor y refresca todos los paneles. */
export async function refreshAll(): Promise<void> {
  try {
    const response = await fetch("/api/refresh", { method: "POST" });
    if (response.ok) {
      try {
        await fetch("/api/quota/refresh", { method: "POST" });
      } catch {
        // un fallo de quota no debe bloquear la refrescada de la UI
      }
    }
  } catch {
    // si el servidor no responde, igual reintentamos el fetch de datos
  }
  bumpTick();
}

export function useApi<T>(path: string, _reloadKey = 0, reloadOnTick = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const _globalTick = useSyncExternalStore(subscribeTick, getTick, getTick);
  const reloadTick = reloadOnTick ? _globalTick : 0;
  useEffect(() => {
    let alive = true;
    setError(null);
    fetch(path)
      .then((r) => r.json())
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [path, _reloadKey, reloadTick]);
  return { data, error };
}
