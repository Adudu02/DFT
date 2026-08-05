/**
 * Tests del adapter Qwen. Verifica el parseo de usage files (token-usage-*.jsonl)
 * y el mapeo al modelo normalizado UsageEvent.
 */
import { describe, it, expect } from "vitest";
import {
  parseQwenUsageLines,
  parseQwenSessionProjectMap,
  deriveQwenIdsFromUsage,
  parseQwenPrompts,
  parseQwenSkills,
  defaultQwenRoot,
} from "../src/adapters/qwen.js";
import { readFileRO } from "../src/lib/fs-readonly.js";
import { join } from "node:path";

const FIXTURE = join(import.meta.dirname, "fixtures", "qwen-usage.jsonl");

async function loadFixture(): Promise<string> {
  return readFileRO(FIXTURE);
}

describe("qwen adapter", () => {
  describe("parseQwenUsageLines", () => {
    it("parsea eventos de uso desde un usage file", async () => {
      const raw = await loadFixture();
      const sessionMap = new Map<string, string>();
      const { events, lineCount, skipped } = parseQwenUsageLines(raw, sessionMap);

      expect(lineCount).toBe(3);
      expect(skipped).toBe(0);
      expect(events).toHaveLength(3);

      // Primer evento: session-aaa-111, sin cached
      const e1 = events[0];
      expect(e1.event.sessionId).toBe("session-aaa-111");
      expect(e1.event.model).toBe("qwen3.7-plus");
      expect(e1.event.input).toBe(35507); // inputTokens - cachedTokens = 35507 - 0
      expect(e1.event.output).toBe(509); // outputTokens + thoughtsTokens = 378 + 131
      expect(e1.event.cacheRead).toBe(0);
      expect(e1.event.cacheWrite).toBe(0);
      expect(e1.dedupKey).toBe("qwen::evt-001");

      // Segundo evento: misma sesión, con cached
      const e2 = events[1];
      expect(e2.event.sessionId).toBe("session-aaa-111");
      expect(e2.event.input).toBe(3704); // 39205 - 35501
      expect(e2.event.output).toBe(367); // 306 + 61
      expect(e2.event.cacheRead).toBe(35501);

      // Tercer evento: sesión diferente
      const e3 = events[2];
      expect(e3.event.sessionId).toBe("session-bbb-222");
      expect(e3.event.input).toBe(40000); // 50000 - 10000
      expect(e3.event.output).toBe(700); // 500 + 200
      expect(e3.event.cacheRead).toBe(10000);
    });

    it("soporta ingesta incremental (fromLine)", async () => {
      const raw = await loadFixture();
      const sessionMap = new Map<string, string>();

      // Leer solo desde la línea 1 (segundo evento en adelante)
      const { events, lineCount } = parseQwenUsageLines(raw, sessionMap, 1);
      expect(lineCount).toBe(3);
      expect(events).toHaveLength(2);
      expect(events[0].event.sessionId).toBe("session-aaa-111");
      expect(events[1].event.sessionId).toBe("session-bbb-222");
    });

    it("skips líneas con JSON corrupto", async () => {
      const raw = '{"id":"ok","sessionId":"s1","model":"qwen3.7-plus","timestamp":"2026-08-05T00:00:00Z","inputTokens":100,"outputTokens":50,"cachedTokens":0,"thoughtsTokens":0}\nCORRUPT\n{"id":"ok2","sessionId":"s1","model":"qwen3.7-plus","timestamp":"2026-08-05T00:00:01Z","inputTokens":200,"outputTokens":100,"cachedTokens":0,"thoughtsTokens":0}\n';
      const sessionMap = new Map<string, string>();
      const { events, skipped } = parseQwenUsageLines(raw, sessionMap);
      expect(events).toHaveLength(2);
      expect(skipped).toBe(1);
    });

    it("skips eventos con todos los tokens en cero", async () => {
      const raw = '{"id":"empty","sessionId":"s1","model":"qwen3.7-plus","timestamp":"2026-08-05T00:00:00Z","inputTokens":0,"outputTokens":0,"cachedTokens":0,"thoughtsTokens":0}\n';
      const sessionMap = new Map<string, string>();
      const { events } = parseQwenUsageLines(raw, sessionMap);
      expect(events).toHaveLength(0);
    });
  });

  describe("parseQwenSessionProjectMap", () => {
    it("construye mapa sessionId → project desde usage_record.jsonl", () => {
      const raw = '{"version":1,"sessionId":"sess-1","project":"/home/user/proj-alpha"}\n{"version":1,"sessionId":"sess-2","project":"/home/user/proj-beta"}\n';
      const map = parseQwenSessionProjectMap(raw);
      expect(map.size).toBe(2);
      expect(map.get("sess-1")).toBe("/home/user/proj-alpha");
      expect(map.get("sess-2")).toBe("/home/user/proj-beta");
    });

    it("ignora líneas sin sessionId o project", () => {
      const raw = '{"version":1}\n{"sessionId":"s1"}\n{"project":"/x"}\n{"sessionId":"s2","project":"/y"}\n';
      const map = parseQwenSessionProjectMap(raw);
      expect(map.size).toBe(1);
      expect(map.get("s2")).toBe("/y");
    });
  });

  describe("deriveQwenIdsFromUsage", () => {
    it("deriva sessionId y project desde un usage file", async () => {
      const raw = await loadFixture();
      const sessionMap = new Map([
        ["session-aaa-111", "/home/user/my-project"],
      ]);
      const { sessionId, project } = deriveQwenIdsFromUsage(raw, sessionMap);
      expect(sessionId).toBe("session-aaa-111");
      expect(project).toBe("my-project");
    });

    it("usa 'qwen' como project si no hay match en el mapa", async () => {
      const raw = await loadFixture();
      const sessionMap = new Map<string, string>();
      const { sessionId, project } = deriveQwenIdsFromUsage(raw, sessionMap);
      expect(sessionId).toBe("session-aaa-111");
      expect(project).toBe("qwen");
    });
  });

  describe("parseQwenPrompts", () => {
    it("extrae prompts de usuario desde un chat JSONL", () => {
      const raw = [
        '{"type":"user","timestamp":"2026-08-05T19:00:00Z","message":{"role":"user","parts":[{"text":"Hola, ¿cómo estás?"}]}}',
        '{"type":"assistant","timestamp":"2026-08-05T19:00:01Z","message":{"role":"model","parts":[{"text":"Bien, gracias."}]}}',
        '{"type":"user","timestamp":"2026-08-05T19:01:00Z","message":{"role":"user","parts":[{"text":"Necesito ayuda con código"}]}}',
      ].join("\n");
      const prompts = parseQwenPrompts(raw);
      expect(prompts).toHaveLength(2);
      expect(prompts[0].prompt).toBe("Hola, ¿cómo estás?");
      expect(prompts[1].prompt).toBe("Necesito ayuda con código");
    });

    it("ignora mensajes de sistema y assistant", () => {
      const raw = [
        '{"type":"system","timestamp":"2026-08-05T19:00:00Z","subtype":"init"}',
        '{"type":"assistant","timestamp":"2026-08-05T19:00:01Z","message":{"role":"model","parts":[{"text":"Respuesta"}]}}',
      ].join("\n");
      const prompts = parseQwenPrompts(raw);
      expect(prompts).toHaveLength(0);
    });
  });

  describe("parseQwenSkills", () => {
    it("detecta comandos /skill al inicio de mensajes de usuario", () => {
      const raw = [
        '{"type":"user","timestamp":"2026-08-05T19:00:00Z","message":{"parts":[{"text":"/review este código"}]}}',
        '{"type":"user","timestamp":"2026-08-05T19:01:00Z","message":{"parts":[{"text":"/compact"}]}}',
      ].join("\n");
      const skills = parseQwenSkills(raw);
      expect(skills).toHaveLength(2);
      expect(skills[0].skill).toBe("review");
      expect(skills[0].kind).toBe("command");
      expect(skills[1].skill).toBe("compact");
    });

    it("ignora menciones de comandos en medio del texto", () => {
      const raw = '{"type":"user","timestamp":"2026-08-05T19:00:00Z","message":{"parts":[{"text":"Usa /compact para resumir"}]}}';
      const skills = parseQwenSkills(raw);
      expect(skills).toHaveLength(0);
    });
  });

  describe("defaultQwenRoot", () => {
    it("retorna ~/.qwen", () => {
      const root = defaultQwenRoot();
      expect(root).toMatch(/\.qwen$/);
    });
  });
});
