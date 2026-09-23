#!/usr/bin/env node
/**
 * Empaqueta tarballs de release autocontenidos que se instalan SIN registro npm:
 * los paquetes workspace (core, insights) van bundleados dentro de node_modules/
 * y declarados como bundledDependencies, así npm jamás intenta bajarlos del
 * registry (npmjs está fuera de nuestro control). Las dependencias nativas
 * (better-sqlite3) y de runtime (fastify…) se declaran normales y sí se bajan.
 *
 * Uso: node scripts/pack-release.mjs        (requiere `pnpm build` ya corrido)
 * Salida: release/how-much-did-u-waste-<v>.tgz y release/how-much-did-u-waste-report-<v>.tgz
 */
import { execSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const core = JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8"));
const insights = JSON.parse(readFileSync(join(root, "packages/insights/package.json"), "utf8"));
const reporter = JSON.parse(readFileSync(join(root, "packages/reporter/package.json"), "utf8"));

const BUNDLED = [core.name, insights.name];
const NATIVE = { "better-sqlite3": core.dependencies["better-sqlite3"] };

function die(cond, msg) {
  if (!cond) {
    console.error(`pack-release: ${msg}`);
    process.exit(1);
  }
}

for (const dir of ["dist", "web/dist", "packages/core/dist", "packages/insights/dist", "packages/reporter/dist"]) {
  die(existsSync(join(root, dir)), `falta ${dir} — corré "pnpm build" primero`);
}

function stageWorkspacePackage(stageDir) {
  // core: package.json tal cual (su dep better-sqlite3 es metadata; la raíz la declara)
  const coreDir = join(stageDir, "node_modules", core.name);
  mkdirSync(coreDir, { recursive: true });
  writeFileSync(join(coreDir, "package.json"), JSON.stringify(core, null, 2));
  cpSync(join(root, "packages/core/dist"), join(coreDir, "dist"), { recursive: true });
  mkdirSync(join(coreDir, "data"), { recursive: true });
  copyFileSync(join(root, "packages/core/data/pricing.json"), join(coreDir, "data/pricing.json"));
  copyFileSync(
    join(root, "packages/core/data/pricing-overrides.json.example"),
    join(coreDir, "data/pricing-overrides.json.example"),
  );
  // insights: sin la dep workspace a core (se resuelve por node_modules hermano)
  const insightsDir = join(stageDir, "node_modules", insights.name);
  mkdirSync(insightsDir, { recursive: true });
  const insightsJson = { ...insights };
  delete insightsJson.dependencies;
  writeFileSync(join(insightsDir, "package.json"), JSON.stringify(insightsJson, null, 2));
  cpSync(join(root, "packages/insights/dist"), join(insightsDir, "dist"), { recursive: true });
}

function pack(stageDir, outName) {
  execSync(`tar czf ${outName} -C ${stageDir} package`, { stdio: "inherit" });
}

const outDir = join(root, "release");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir);

// ---- Tarball 1: el dashboard + CLI (how-much-did-u-waste) ----
const mainStage = join(outDir, "stage-main");
const mainPkg = join(mainStage, "package");
mkdirSync(mainPkg, { recursive: true });
const rootJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const mainJson = {
  ...rootJson,
  dependencies: {
    fastify: rootJson.dependencies.fastify,
    "@fastify/static": rootJson.dependencies["@fastify/static"],
    "@sqlite.org/sqlite-wasm": rootJson.dependencies["@sqlite.org/sqlite-wasm"],
    ...NATIVE,
  },
  bundledDependencies: BUNDLED,
};
delete mainJson.scripts;
delete mainJson.devDependencies;
delete mainJson.packageManager;
writeFileSync(join(mainPkg, "package.json"), JSON.stringify(mainJson, null, 2));
cpSync(join(root, "bin"), join(mainPkg, "bin"), { recursive: true });
cpSync(join(root, "dist"), join(mainPkg, "dist"), { recursive: true });
cpSync(join(root, "web/dist"), join(mainPkg, "web/dist"), { recursive: true });
for (const f of ["README.md", "SECURITY.md", "LICENSE"]) {
  if (existsSync(join(root, f))) copyFileSync(join(root, f), join(mainPkg, f));
}
stageWorkspacePackage(mainPkg);
const mainTgz = `how-much-did-u-waste-${version}.tgz`;
pack(mainStage, join(outDir, mainTgz));

// ---- Tarball 2: el reporter de CI (how-much-did-u-waste-report) ----
const repStage = join(outDir, "stage-reporter");
const repPkg = join(repStage, "package");
mkdirSync(repPkg, { recursive: true });
const repJson = {
  name: reporter.name,
  version,
  type: "module",
  description: reporter.description,
  license: "MIT",
  author: reporter.author,
  repository: reporter.repository,
  homepage: reporter.homepage,
  bugs: reporter.bugs,
  keywords: reporter.keywords,
  bin: reporter.bin,
  engines: reporter.engines,
  dependencies: { ...NATIVE },
  bundledDependencies: BUNDLED,
};
writeFileSync(join(repPkg, "package.json"), JSON.stringify(repJson, null, 2));
cpSync(join(root, "packages/reporter/dist"), join(repPkg, "dist"), { recursive: true });
copyFileSync(join(root, "packages/reporter/README.md"), join(repPkg, "README.md"));
copyFileSync(join(root, "LICENSE"), join(repPkg, "LICENSE"));
stageWorkspacePackage(repPkg);
const repTgz = `how-much-did-u-waste-report-${version}.tgz`;
pack(repStage, join(outDir, repTgz));

rmSync(join(outDir, "stage-main"), { recursive: true, force: true });
rmSync(join(outDir, "stage-reporter"), { recursive: true, force: true });

console.log(`\nOK — tarballs en release/:`);
for (const f of readdirSync(outDir)) console.log(`  release/${f}`);
