# Tasks: db-schema-versioning

## 1. Versionado de schema

- [x] 1.1 En `packages/core/src/lib/db.ts`: exportar `SCHEMA_VERSION` (= 2), añadir `schema_info` al `SCHEMA`, tabla `MIGRATIONS` (v1 → ALTER source_path), deducción de versión para DBs pre-versioning, bucle de migraciones y sellado; rechazo con error accionable si la versión de la DB es futura. Verificar: `pnpm --filter motor-agentico-core test` pasa.

- [x] 1.2 Tests en `packages/core/test/db.test.ts`: DB nueva queda sellada a `SCHEMA_VERSION`; DB legacy v1 (sin source_path) migra y conserva datos; DB con versión futura lanza error con mensaje de rebuild. Verificar: los 3 tests nuevos pasan junto al test legacy existente.

## 2. Verificación integral

- [x] 2.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm run build` — todo en verde. Verificar: salida limpia en los cuatro comandos.
