# Tasks: coverage-ci-lint

## 1. Cobertura (⑯)

- [x] 1.1 Agregar `@vitest/coverage-v8` como devDependency en raíz y `packages/core`; configurar bloque `coverage` (provider v8, reporter `text` + `html`) en ambos `vitest.config.ts`; agregar scripts `test:coverage` en raíz y core. Verificar: `pnpm install` y `pnpm test:coverage` corren y muestran la tabla.

- [x] 1.2 Medir el baseline real y fijar umbrales `lines`/`functions` 2-3 puntos por debajo en ambos configs. Verificar: `pnpm test:coverage` pasa con los umbrales configurados.

## 2. CI matrix + audit (⑰)

- [x] 2.1 En `.github/workflows/ci.yml`: matrix `node-version: [20, 22]`, y paso nuevo `pnpm audit --audit-level=moderate` tras el install. Verificar: el YAML es válido y los pasos reflejan el matrix.

## 3. Biome recommended (⑱)

- [x] 3.1 Activar `recommended: true` en `biome.json`; bajar `noExplicitAny` a `warn` con comentario de motivo. Verificar: el config refleja el cambio.

- [x] 3.2 Aplicar `biome lint --write` (auto-fixes seguros) y corregir a mano los errores restantes solo con cambios behavior-neutral (tipado, imports, estructura). Si algún fix exigiera cambiar lógica, bajar esa regla a `warn` con comentario. Verificar: `pnpm lint` en verde (exit 0) y `pnpm typecheck` pasa.

## 4. Verificación integral

- [x] 4.1 Ejecutar `pnpm typecheck && pnpm lint && pnpm test && pnpm test:coverage && pnpm run build` — todo en verde con umbrales y recommended activos. Verificar: salida limpia en los cinco comandos.
