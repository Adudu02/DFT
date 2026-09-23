# Motor Agéntico — Plan de Mejoras

> ✅ **COMPLETADO — 2026-09-13.** Los 21 ítems de este plan fueron ejecutados y verificados
> (cada uno con su change OpenSpec en `openspec/changes/archive/`). Este documento queda
> como registro histórico; los requisitos vivos viven en `openspec/specs/`.
> Estado final: 128 tests · CI en Node 22/24 con audit · Biome recommended 0 errores · bundle por páginas · 5 specs en `openspec/specs/`.

### Trazabilidad de ejecución

| Ítems | Change OpenSpec (archivado) | Commit/PR |
|---|---|---|
| ①②③ Quick wins (Qwen skills, INLINE_STYLES, term-red) | — (pre-OpenSpec) | `c20a75a` |
| ④ Feedback JSON inválido en Configuración | `config-json-validation-feedback` | `a623d6c` |
| ⑪ Error boundary por página | `app-error-boundary` | `3cdbb50` |
| ⑫⑬⑭⑮ Tests faltantes (export, Qwen e2e, reporter, server) | `add-missing-tests` | `3c2122b` |
| ⑯⑰⑱ Cobertura + CI matrix/audit + Biome recommended | `coverage-ci-lint` | PR #6 · `c7f35a2` |
| ⑤⑥ React Router + code-splitting | `router-code-splitting` | PR #7 · `a0072cc` |
| ⑦⑧⑨⑩ Accesibilidad (re-scoped post-router) | `web-a11y-foundations` | PR #8 · `e47c0a7` |
| ⑲ Consolidar scripts de arranque | `consolidate-start-scripts` | PR #9 · `a1c962c` |
| ⑳ Streaming en `searchPrompts` | `search-prompts-streaming` | PR #10 · `295d7b1` |
| ㉑ Schema versioning de la DB | `db-schema-versioning` | PR #11 · `daa40d1` |

Desviaciones documentadas (en el design de cada change): ⑰ matrix Node [22, 24] — pnpm 11
exige ≥ 22.13 y Node 20 está EOL; ⑦ patrón ARIA tabs satisfecho por la navegación de rutas
(`NavLink` + `aria-current="page"`); ⑯ cobertura como visibilidad local, aún sin gatear CI.

> Generado: 2026-08-27 · Estado post-migración de dependencias (React 19, Tailwind 4, Vite 8, Vitest 4, TS 7, Recharts 3).
> Audit: 0 vulns · Lint: limpio · Typecheck: limpio · Tests: 101 pasando · Build: OK.

---

## Estado actual

| Check | Resultado |
|---|---|
| `pnpm audit` | ✅ 0 vulnerabilidades |
| `pnpm lint` | ✅ limpio (66 archivos) |
| `pnpm typecheck` | ✅ limpio (TypeScript 7) |
| `pnpm test` | ✅ 101 tests (96 core + 3 reporter + 2 server) |
| `pnpm run build` | ✅ funciona (Vite 8 + Rolldown) |
| TODOs/FIXMEs | 0 reales |
| Deps atrasadas (major) | 0 |

---

## Quick Wins (alto impacto, bajo esfuerzo)

### 1. 🔌 Conectar `parseQwenSkills` en el registry

**Problema:** El adapter de Qwen implementa `parseQwenSkills()` (detecta comandos `/skill` en mensajes de usuario). Está testeado en `qwen.test.ts`. Sin embargo, el registry en `packages/core/src/adapters/registry.ts` línea ~98 devuelve `parseSkills: () => []` con el comentario "Qwen no expone skills en el formato que detectamos". El parser existe pero nunca se usa en la ingesta real.

**Fix:** En `packages/core/src/adapters/registry.ts`, cambiar:
```ts
parseSkills: () => [], // Qwen no expone skills en el formato que detectamos
```
por:
```ts
parseSkills: parseQwenSkills,
```
Importar `parseQwenSkills` desde `./qwen.js`.

**Archivos:** `packages/core/src/adapters/registry.ts`
**Tests:** Verificar que `qwen.test.ts` sigue pasando. Considerar añadir un test de integración que verifique que skills de Qwen aparecen en `getSkills()`.
**Riesgo:** bajo — el parser ya existe y está testeado.

---

### 2. 🧹 Eliminar `INLINE_STYLES` vacío

**Problema:** `web/src/constants.ts` exporta `INLINE_STYLES = ""`. `web/src/App.tsx` lo importa e inyecta via `<style>{INLINE_STYLES}</style>`. Es código muerto — el string siempre está vacío.

**Fix:**
1. Eliminar la exportación en `web/src/constants.ts`.
2. Eliminar el import y la línea `<style>{INLINE_STYLES}</style>` en `web/src/App.tsx`.

**Archivos:** `web/src/constants.ts`, `web/src/App.tsx`
**Riesgo:** nulo — no tiene efecto observable.

---

### 3. 🎨 Separar `term-red` de `term-amber`

**Problema:** En `web/tailwind.config.js`, tanto `term.amber` como `term.red` son `"#e56b83"`. Los errores (`text-term-red` en `ErrorMsg`) y los acentos (`text-term-amber`) son visualmente idénticos. El usuario no puede distinguir un error de un elemento decorativo por el color.

**Fix:** Asignar a `term.red` un color distintivo para errores. Opciones:
- Rojo puro: `"#ef4444"` (Tailwind red-500, legible sobre fondo oscuro)
- Rojo cálido: `"#f87171"` (red-400, más suave)
- Rosa-rojo: `"#fb7185"` (rose-400, coherente con Nocturne pero distinguible)

Actualizar `web/tailwind.config.js`:
```js
red: "#ef4444", // aviso/error — distinguible del acento carmesí
```

**Archivos:** `web/tailwind.config.js`
**Riesgo:** bajo — cambio cosmético. Verificar que el nuevo rojo sea legible sobre el fondo `#121110`.

---

## Mejoras de UX

### 4. 💬 Feedback JSON inválido en Configuración

**Problema:** En `web/src/pages/Configuracion.tsx`, el textarea de downgrade-paths tiene un `onChange` con `catch {}` que ignora silenciosamente JSON inválido. El usuario no recibe feedback de que su edición está mal formada hasta que pulsa "Guardar".

**Fix:** Mostrar un indicador visual (borde rojo, texto de error) cuando el JSON del textarea es inválido. Estado local con `useState<string | null>(error)` que se actualiza en `onChange`.

**Archivos:** `web/src/pages/Configuracion.tsx`

---

### 5. 🌐 React Router (URLs estables)

**Problema:** `App.tsx` usa `useState(0)` para la tab activa. No hay router — el estado se pierde al recargar. No hay deep links a páginas específicas.

**Fix:** Añadir `react-router-dom`. Cada tab se convierte en una ruta (`/`, `/ahorro`, `/skills`, `/memoria`, `/actividad`, `/configuracion`, `/ayuda`). Permite back/forward del navegador, deep links, y bookmarking.

**Archivos:** `web/src/App.tsx`, `web/src/main.tsx`, `package.json` (añadir `react-router-dom`)
**Complejidad:** media — requiere migrar la navegación de tabs a rutas.

---

### 6. 📦 Code-splitting del bundle

**Problema:** El build produce un solo chunk JS de 569 KB (Vite avisa > 500 KB). Todo el código de las 7 páginas se carga de inicio, aunque el usuario solo vea una a la vez.

**Fix:** Combinar `React.lazy()` + `Suspense` para lazy-load las páginas. Si se añade router (item 5), cada ruta puede ser un lazy import:
```tsx
const Ahorro = lazy(() => import("./pages/Ahorro"));
```
Esto reduce el bundle inicial significativamente (Recharts solo se carga en las páginas que lo usan).

**Archivos:** `web/src/App.tsx`
**Depende de:** item 5 (router) para máximo beneficio, pero se puede hacer independientemente.

---

## Accesibilidad

### 7. ♿ ARIA tab pattern

**Problema:** La barra de tabs en `App.tsx` usa `<button>` planos sin `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, ni navegación con flechas. Screen readers no pueden convey el estado de las tabs.

**Fix:** Añadir los roles ARIA y manejo de teclado (flechas izquierda/derecha para navegar tabs, Home/End para primera/última).

**Archivos:** `web/src/App.tsx`
**Referencia:** [WAI-ARIA Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)

---

### 8. ♿ Heading hierarchy

**Problema:** La página no tiene `<h1>`, `<h2>`, etc. El brand es `<span className="brand">`, los títulos de panel son `<div className="kicker">`. No hay outline semántico para tecnología asistiva.

**Fix:**
- Brand → `<h1>` (o envolver en un `<header>` con `<h1>`)
- Títulos de panel → `<h2>`
- Sub-secciones → `<h3>`

**Archivos:** `web/src/App.tsx`, `web/src/components/Panel.tsx`, posiblemente páginas individuales.

---

### 9. ♿ SVG Memoria accesible

**Problema:** El grafo de memoria en `Memoria.tsx` es un `<svg>` sin `role="img"`, sin `aria-label`, sin `<title>` ni `<desc>`. Es completamente invisible para screen readers.

**Fix:** Añadir `role="img"` y `aria-label="Grafo de memoria: N memorias, X obsoletas"` al SVG. Opcionalmente un `<title>` y `<desc>` dentro del SVG.

**Archivos:** `web/src/pages/Memoria.tsx`

---

### 10. ♿ Focus indicators y RefreshControl

**Problema:** Solo `PromptRow` tiene `focus:ring-1`. Los demás elementos interactivos (tabs, chips, botones de expandir) dependen del outline del navegador. El botón de refresh muestra solo `↻` sin `aria-label`. El toggle AUTO no tiene `aria-pressed`.

**Fix:**
- Añadir `focus:ring-1 focus:ring-term-amber` a tabs, chips, y botones interactivos.
- Añadir `aria-label="Refrescar datos"` al botón de refresh.
- Añadir `aria-pressed={auto}` al toggle AUTO.

**Archivos:** `web/src/App.tsx`, `web/src/components/RefreshControl.tsx`, `web/src/pages/Actividad.tsx`

---

## Resiliencia

### 11. 🛡️ Error boundary

**Problema:** Si cualquier página throw durante render, toda la app se cae sin recuperación.

**Fix:** Envolver `<Active />` en un React error boundary que muestre un mensaje de error con opción de reintentar.

**Archivos:** `web/src/App.tsx` (o nuevo componente `ErrorBoundary.tsx`)

---

## Testing

### 12. 🧪 Tests para `export.ts`

**Problema:** `packages/core/src/lib/export.ts` genera CSV y JSON para exportación de sesiones. No tiene tests. Edge cases como comillas, saltos de línea en valores, y valores vacíos no están cubiertos.

**Archivos:** nuevo `packages/core/test/export.test.ts`

---

### 13. 🧪 Integration test Qwen pipeline

**Problema:** Los adapters de Claude Code y Codex tienen integration tests que corren `ingestAll()` y verifican que los datos llegan a la DB. Qwen no tiene uno análogo, a pesar de ser un adapter multi-session con lógica distinta.

**Fix:** Crear un test que corra `ingestAll()` con el Qwen adapter y verifique sessions, usage_events, y (tras item 1) skills en la DB.

**Archivos:** `packages/core/test/qwen.test.ts` (añadir describe) o nuevo `packages/core/test/qwen-integration.test.ts`

---

### 14. 🧪 Tests reporter (`toText`, `parseArgs`)

**Problema:** `packages/reporter/src/report.ts` exporta `toText()` que genera el output legible del reporter. No está testeado. `parseArgs()` en `src/index.ts` tampoco.

**Archivos:** `packages/reporter/test/report.test.ts`

---

### 15. 🧪 Tests server endpoints faltantes

**Problema:** `test/server.test.ts` solo cubre validación de config/pricing y actividad. Endpoints sin test:
- `GET /api/health`
- `POST /api/refresh`
- `GET /api/session/:id`
- `GET /api/session/:id/turns`
- `GET /api/memory`
- `GET /api/skills`
- `POST /api/rebuild`

**Archivos:** `test/server.test.ts`

---

### 16. 📊 Cobertura de tests

**Problema:** `@vitest/coverage-v8` no está configurado. No hay visibilidad de qué código está cubierto.

**Fix:**
1. `pnpm add -D @vitest/coverage-v8`
2. Añadir a `vitest.config.ts`: `coverage: { provider: "v8", reporter: ["text", "html"] }`
3. Considerar umbral mínimo (ej. 80% lines).

---

## CI

### 17. 🚀 CI: audit + matrix Node

**Problema:** El CI solo corre en Node 22. `engines` declara `>= 20`, así que Node 20 es soportado pero nunca se testea. No hay `pnpm audit` en CI.

**Fix en `.github/workflows/ci.yml`:**
```yaml
strategy:
  matrix:
    node-version: [20, 22]
# ...
- run: pnpm audit --audit-level=moderate
```

**Archivos:** `.github/workflows/ci.yml`

---

## Code Quality

### 18. 🔧 Activar Biome recommended rules

**Problema:** `biome.json` tiene `recommended: false` y solo activa `noUnusedVariables`. Se podrían activar reglas útiles: `noDebugger`, `noUnusedImports`, `useExhaustiveDependencies`, `noVoidTypeReturn`, etc.

**Fix:** Cambiar a `recommended: true` o activar reglas específicas por categoría. Correr `pnpm lint` y fix los warnings.

**Archivos:** `biome.json`, posiblemente archivos fuente si hay violations.

---

## Cleanup

### 19. 🔗 Consolidar `start.sh` + `scripts/start.mjs`

**Problema:** Hay dos entry points de arranque: `start.sh` (root, usado por el launcher desktop) y `scripts/start.mjs` (usado por `pnpm start`). Hacen lo mismo con implementaciones distintas. Riesgo de divergencia.

**Fix:** Unificar en uno solo. Opción: hacer que `start.sh` sea un wrapper que llame a `scripts/start.mjs`, o eliminar `start.sh` y actualizar el launcher desktop.

**Archivos:** `start.sh`, `scripts/start.mjs`, `scripts/install-launcher.sh`

---

## Performance (futuro)

### 20. ⚡ Streaming para `searchPrompts`

**Problema:** `searchPrompts()` en `packages/core/src/lib/activity.ts` carga cada transcript completo en memoria (`readFileRO`). Para sesiones grandes o muchas sesiones, esto puede ser costoso.

**Fix:** Usar `readline` o streaming line-by-line para buscar prompts sin cargar el archivo entero.

**Archivos:** `packages/core/src/lib/activity.ts`

---

### 21. 🗄️ Schema versioning para DB

**Problema:** La DB tiene una migración inline (`ALTER TABLE sessions ADD COLUMN source_path TEXT`) pero no hay version tracking. Si futuros cambios requieren más migraciones, no hay mecanismo para aplicarlas en orden.

**Fix:** Añadir una constante `SCHEMA_VERSION` y una tabla `schema_info`. Al abrir la DB, verificar versión y aplicar migraciones pendientes o forzar rebuild si hay incompatibilidad.

**Archivos:** `packages/core/src/lib/db.ts`

---

## Resumen visual

```
        IMPACTO
        ▲
   Alto │  ① ← quick win (5 min)
        │
        │   ②  ③  ④     ⑥
   Medio │         ⑤  ⑦  ⑧  ⑨  ⑩  ⑪  ⑫  ⑬  ⑭  ⑮  ⑯  ⑰  ⑱
        │
    Bajo │              ⑲
        │                              ⑳  ㉑
        └──────────────────────────────────────────────►
             🟢 Bajo        🟡 Medio        🔴 Alto
                          ESFUERZO
```

## Orden sugerido de ejecución

1. **①** Conectar Qwen skills (5 min, bug fix real)
2. **②** Eliminar INLINE_STYLES (2 min, cleanup)
3. **③** Separar term-red de term-amber (5 min, UX)
4. **④** Feedback JSON inválido (15 min, UX)
5. **⑪** Error boundary (30 min, resiliencia)
6. **⑫⑬⑭⑮** Tests faltantes (2-3 h, calidad)
7. **⑯** Cobertura de tests (30 min, visibilidad)
8. **⑰** CI audit + matrix Node (30 min, CI)
9. **⑱** Biome recommended rules (1 h, quality)
10. **⑤⑥** Router + code-splitting (4-5 h, feature + perf)
11. **⑦⑧⑨⑩** Accesibilidad (2-3 h, a11y)
12. **⑲** Consolidar start scripts (1 h, cleanup)
13. **⑳㉑** Streaming + schema versioning (future, infra)


Nuevo adicion: Un lector de limites totales de cada cuenta de agente de IA.
