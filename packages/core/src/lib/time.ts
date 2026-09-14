/**
 * Día calendario en la zona del usuario. Los transcripts guardan `ts` en UTC;
 * agrupar por `ts.slice(0,10)` mete lo de la noche en el día siguiente (en
 * México, todo lo posterior a las 18:00 local). Todo lo que agrupe por día debe
 * pasar por acá.
 */

/** YYYY-MM-DD en `timeZone` (vacío = zona del sistema). Zona inválida => UTC. */
export function dayInTz(ts: string, timeZone?: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts.slice(0, 10);
  try {
    // en-CA formatea como YYYY-MM-DD, que es justo el formato que guardamos.
    return d.toLocaleDateString("en-CA", timeZone ? { timeZone } : {});
  } catch {
    return ts.slice(0, 10); // timeZone inválida en config
  }
}

/**
 * Normaliza un timestamp de fuente heterogénea a ISO 8601: acepta epoch-ms,
 * epoch-s (heurística >1e12 = ms) o string parseable. null si no es interpretable
 * (la línea/fila se cuenta como skipped, nunca se inventa fecha).
 */
export function toIsoTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return null;
}
