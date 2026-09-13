# Proposal: db-schema-versioning

## Why

La DB tiene una migración inline silenciosa (`ALTER TABLE sessions ADD COLUMN source_path` con `catch {}`) y ningún registro de versión (ítem ㉑ de `MEJORAS.md`). Futuros cambios de schema no tendrán un mecanismo para aplicarse en orden, y una DB escrita por una versión **más nueva** del programa hoy produce errores crípticos en lugar de un mensaje accionable.

## What Changes

- `SCHEMA_VERSION` exportada (v2 = schema actual, con `source_path`).
- Tabla `schema_info` (fila única con la versión) creada junto al resto del schema.
- `openDb` ahora: deduce la versión de DBs pre-versioning por la forma del schema (`PRAGMA table_info`), aplica migraciones ordenadas (`MIGRATIONS[v]` lleva de v a v+1), sella la versión actual, y **rechaza con error accionable** una DB de una versión futura (la DB es caché reconstruible).
- La migración legacy v1→v2 es exactamente el `ALTER` que ya existía — deja de ejecutarse a ciegas en cada apertura.

## Capabilities

<!-- skip_specs: true — mecánica interna de la capa de almacenamiento; el producto no cambia. -->

## Impact

- **Código**: `packages/core/src/lib/db.ts` (único archivo productivo) + tests en `packages/core/test/db.test.ts`.
- **Compatibilidad**: DBs viejas (v1 sin `source_path`, y la forma v2 sin sellar) se detectan y sellan automáticamente; sin rebuild manual. DBs de versión futura → error claro con la instrucción de rebuild/borrado.
- **Riesgo**: bajo — la única migración existente conserva su semántica; los tests cubren los tres caminos (nueva, legacy, futura).
