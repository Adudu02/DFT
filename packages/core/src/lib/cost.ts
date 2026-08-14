/**
 * Motor de costos "equivalente API" (PLAN §2). Tarifas en USD por millón de
 * tokens. cache_write = 1.25× input, cache_read = 0.10× input.
 */
import type { UsageEvent } from "../adapters/types.js";
import type { Rate } from "./pricing.js";

const PER_MILLION = 1_000_000;

/** Costo de un evento. rate null (modelo sin tarifa) => 0, nunca se estima. */
export function costForEvent(ev: UsageEvent, rate: Rate | null): number {
  if (!rate) return 0;
  return (
    (ev.input * rate.input +
      ev.output * rate.output +
      ev.cacheWrite * rate.input * 1.25 +
      ev.cacheRead * rate.input * 0.1) /
    PER_MILLION
  );
}
