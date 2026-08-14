import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dataDir, setDataDir } from "../src/lib/paths.js";

describe("dataDir / setDataDir", () => {
  afterEach(() => setDataDir(join(process.cwd(), "data"))); // restaura el default

  it("por defecto es <cwd>/data", () => {
    expect(dataDir()).toBe(join(process.cwd(), "data"));
  });

  it("setDataDir sobreescribe la raíz (para embeber como librería)", () => {
    setDataDir("/tmp/motor-embed");
    expect(dataDir()).toBe("/tmp/motor-embed");
  });
});
