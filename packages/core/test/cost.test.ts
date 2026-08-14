import { describe, it, expect } from "vitest";
import { costForEvent } from "../src/lib/cost.js";
import { getRate, UnknownModels, type Pricing } from "../src/lib/pricing.js";
import type { UsageEvent } from "../src/adapters/types.js";

const pricing: Pricing = {
  models: {
    "claude-opus-4-8": { input: 5.0, output: 25.0 },
  },
};

function ev(partial: Partial<UsageEvent>): UsageEvent {
  return {
    sessionId: "s",
    ts: "2026-07-01T00:00:00.000Z",
    day: "2026-07-01",
    model: "claude-opus-4-8",
    input: 0,
    output: 0,
    cacheWrite: 0,
    cacheRead: 0,
    ...partial,
  };
}

describe("costForEvent", () => {
  it("aplica la formula §2: in*5 + out*25 + cacheW*5*1.25 + cacheR*5*0.10 por millon", () => {
    // 1M de cada tipo con opus: 5 + 25 + 6.25 + 0.5 = 36.75
    const rate = getRate(pricing, "claude-opus-4-8")!;
    const cost = costForEvent(
      ev({ input: 1_000_000, output: 1_000_000, cacheWrite: 1_000_000, cacheRead: 1_000_000 }),
      rate,
    );
    expect(cost).toBeCloseTo(36.75, 6);
  });

  it("solo input", () => {
    const rate = getRate(pricing, "claude-opus-4-8")!;
    expect(costForEvent(ev({ input: 2_000_000 }), rate)).toBeCloseTo(10.0, 6);
  });

  it("modelo desconocido (rate null) => costo 0", () => {
    expect(costForEvent(ev({ input: 1_000_000, model: "claude-ghost-9" }), null)).toBe(0);
  });
});

describe("getRate + UnknownModels", () => {
  it("registra modelos sin tarifa y devuelve null", () => {
    const unknown = new UnknownModels();
    expect(getRate(pricing, "claude-ghost-9", unknown)).toBeNull();
    expect(getRate(pricing, "claude-opus-4-8", unknown)).not.toBeNull();
    expect(unknown.list()).toEqual(["claude-ghost-9"]);
    expect(unknown.size).toBe(1);
  });
});
