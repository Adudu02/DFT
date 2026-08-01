#!/usr/bin/env node
/**
 * Arranque en un paso (cross-platform): instala dependencias y compila la UI si
 * faltan, luego levanta el dashboard (ingesta + API + UI en 127.0.0.1:8081).
 * Equivale a start.sh pero sin depender de bash. Usado por `pnpm start`.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shell = process.platform === "win32"; // pnpm es .cmd en Windows

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!existsSync(join(root, "node_modules"))) {
  console.log("• Instalando dependencias…");
  run("pnpm", ["install"]);
}
if (!existsSync(join(root, "web", "dist", "index.html"))) {
  console.log("• Compilando la UI (una sola vez)…");
  run("pnpm", ["run", "build:web"]);
}
console.log("• Dashboard en http://127.0.0.1:8081");
run("pnpm", ["run", "serve"]);
