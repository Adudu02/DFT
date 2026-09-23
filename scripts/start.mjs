#!/usr/bin/env node
/**
 * Arranque en un paso (cross-platform, única implementación del arranque).
 * Instala dependencias y compila lo que falte; `--update` reinstala, recompila
 * y reinicia el dashboard. `start.sh` y `pnpm start` delegan aquí.
 */
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL = "http://127.0.0.1:8081";
const HEALTH = `${URL}/api/health`;
const shell = process.platform === "win32"; // pnpm es .cmd en Windows
const update = process.argv.includes("--update") || process.argv.includes("-u");

async function health() {
  try {
    const r = await fetch(HEALTH, { signal: AbortSignal.timeout(1000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function healthy() {
  return Boolean(await health());
}

function openBrowser() {
  const [cmd, ...args] =
    process.platform === "darwin"
      ? ["open", URL]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", URL]
        : ["xdg-open", URL];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // sin navegador/gráficos: el dashboard sigue accesible por URL
  }
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// Ya está corriendo: reiniciar solo si se solicitó explícitamente.
const runningHealth = await health();
if (runningHealth) {
  if (!update) {
    console.log("• El dashboard ya está corriendo en " + URL);
    console.log("Tip: ./start.sh --update para recompilar y reiniciar");
    openBrowser();
    process.exit(0);
  }
  if (!Number.isSafeInteger(runningHealth.pid) || runningHealth.pid <= 0) {
    console.error("• El servidor no informa su PID; cierra el dashboard en ejecución y vuelve a intentarlo.");
    process.exit(1);
  }
  try {
    process.kill(runningHealth.pid, "SIGTERM");
  } catch (err) {
    console.error("• No se pudo cerrar el dashboard en ejecución:", err.message);
    process.exit(1);
  }
  for (let i = 0; i < 20 && (await healthy()); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (await healthy()) {
    console.error("• El dashboard sigue activo tras 10 segundos; ciérralo manualmente y vuelve a intentarlo.");
    process.exit(1);
  }
}

if (update) {
  console.log("• Instalando dependencias…");
  run("pnpm", ["install"]);
  for (const [script, message] of [
    ["build:core", "• Compilando core…"],
    ["build:insights", "• Compilando insights…"],
    ["build:web", "• Compilando la UI…"],
  ]) {
    console.log(message);
    run("pnpm", ["run", script]);
  }
}

if (!existsSync(join(root, "node_modules"))) {
  console.log("• Instalando dependencias…");
  run("pnpm", ["install"]);
}
if (!existsSync(join(root, "web", "dist", "index.html"))) {
  console.log("• Compilando la UI (una sola vez)…");
  run("pnpm", ["run", "build:web"]);
}
for (const pkg of ["core", "insights"]) {
  if (!existsSync(join(root, "packages", pkg, "dist"))) {
    console.log(`• Compilando ${pkg}…`);
    run("pnpm", ["run", `build:${pkg}`]);
  }
}

console.log("• Arrancando dashboard en " + URL);
const server = spawn("pnpm", ["run", "serve"], { cwd: root, stdio: "inherit", shell });

for (let i = 0; i < 60; i++) {
  if (await healthy()) break;
  await new Promise((r) => setTimeout(r, 500));
}
openBrowser();

// Limpieza equivalente al trap del start.sh anterior.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.kill("SIGTERM");
    process.exit(0);
  });
}
server.on("exit", (code) => process.exit(code ?? 0));
