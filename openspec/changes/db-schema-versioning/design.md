# Design: db-schema-versioning

## Context

`openDb` ejecuta el `SCHEMA` (idempotente) y luego un `ALTER` a ciegas con `catch {}` — el patrón no escala a más migraciones ni distingue "ya migrada" de "incompatible". La DB es caché reconstruible (`./data/motor.db`), lo que habilita la política de rechazo con rebuild para DBs futuras. Ver proposal.md.

## Goals / Non-Goals

**Goals:**

- Versión registrada en la propia DB, migraciones ordenadas y explícitas.
- Mensaje accionable si la DB es más nueva que el programa.

**Non-Goals:**

- No se implementan migraciones revertibles ni downgrades.
- No se auto-borra/reconstruye la DB ante incompatibilidad — se informa al usuario (borrar un caché automáticamente es una sorpresa destructiva; el mensaje indica exactamente qué hacer).
- No se tocan los schemas de las tablas existentes.

## Decisions

1. **`schema_info` con fila única `id = 1`.** `CHECK (id = 1)` impide filas múltiples; `INSERT ... ON CONFLICT DO UPDATE` sella/actualiza. Vive en `SCHEMA`, así que toda DB nueva nace con ella.
2. **Deducción para DBs pre-versioning (no hay fila):** `PRAGMA table_info(sessions)` — si tiene `source_path`, la DB ya tenía la forma actual → se sella a v2; si no, es v1 → se aplican las migraciones desde v1. Sin esta deducción, la primera apertura de cualquier DB existente ejecutaría migraciones innecesarias.
3. **`MIGRATIONS: Record<number, string[]>` — la entrada `v` lleva de v a v+1.** Hoy solo `1: [ALTER source_path]`. La v2 será la próxima. Cada statement corre en try/catch tolerante (columna ya presente en estados intermedios), igual que el comportamiento actual.
4. **Versión futura → `throw` con mensaje accionable y `db.close()`.** El error nombra la versión de la DB, la soportada y el comando (`--rebuild` o borrar el archivo). Los procesos (server/CLI) ya propagan el error tal cual.

## Risks / Trade-offs

- [Un fallo real de migración se traga como "ya existe"] → Mismo comportamiento que hoy; la verificación de integridad del motor (`integrity.test.ts`) y el uso inmediato de las columnas harían visible el fallo. El trade-off se revisa si el catálogo de migraciones crece.
- [Olvidar incrementar `SCHEMA_VERSION` al cambiar el schema] → El comentario en la constante lo indica; un test de forma (schema sellado = constante) documenta el contrato.

## Migration Plan

Automática en la primera `openDb` posterior al merge (deducción + sellado). Rollback = revertir; una DB sellada a v2 sigue abriéndose con el código anterior (solo ignora `schema_info`).

## Open Questions

Ninguna que bloquee implementación.
