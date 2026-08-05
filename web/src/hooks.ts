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
    await fetch("/api/refresh", { method: "POST" });
  } catch {
    // si el servidor no responde, igual reintentamos el fetch de datos
  }
  bumpTick();
}

export function useApi<T>(path: string, reloadKey = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const globalTick = useSyncExternalStore(subscribeTick, getTick, getTick);
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
  }, [path, reloadKey, globalTick]);
  return { data, error };
}
