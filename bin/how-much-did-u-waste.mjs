#!/usr/bin/env node
/**
 * Entry publicado. Sin flags => arranca el dashboard (127.0.0.1:8081). Con
 * `--waste` (o argumentos posicionales) => corre el CLI de fugas. El estado
 * (DB, reportes, config) se escribe en `./data` del directorio actual.
 */
const args = process.argv.slice(2);
const wantsCli = args.some((a) => a === "--waste" || a === "--help" || !a.startsWith("-"));

if (wantsCli) {
  // dist/cli.js ejecuta su main() al importarse y lee process.argv.
  await import("../dist/cli.js");
} else {
  const { main } = await import("../dist/server.js");
  await main();
}
