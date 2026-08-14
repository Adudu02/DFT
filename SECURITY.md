# Política de seguridad

Motor Agéntico lee transcripts de agentes (Claude Code, Codex, Qwen) que pueden
contener información sensible. La seguridad no es un añadido: es el motivo por el
que la herramienta es viable de correr contra datos reales. Este documento dice
qué garantiza el diseño, cómo está el árbol de dependencias, y cómo reportar un
problema.

## Garantías de diseño

- **Fuentes en solo lectura.** `~/.claude`, `~/.codex`, `~/.qwen` y demás fuentes
  se abren siempre con flag `'r'` (ver `src/lib/fs-readonly.ts`). El test
  [`test/integrity.test.ts`](test/integrity.test.ts) hashea el árbol de fuentes
  antes y después de ingerir y falla si algo cambió.
- **Nunca toca credenciales.** Lista blanca de lectura: solo `rollout-*.jsonl`,
  `*.jsonl` y memoria `*.md`. Nunca abre `~/.codex/auth.json`, `.env` ni archivos
  de credenciales.
- **Sin claves API.** El costo es *equivalente API* calculado desde conteos de
  tokens locales; la herramienta nunca pide, recibe ni almacena credenciales de
  ningún proveedor.
- **La DB solo guarda métricas.** `./data/motor.db` guarda conteos de tokens,
  modelo y nombres de skills — **nunca** el texto de tus prompts. El drill-down de
  Actividad los lee del transcript original (solo lectura) en el momento de la
  consulta y no los persiste.
- **Solo local.** El servidor bindea **únicamente a `127.0.0.1:8081`** — sin auth,
  sin exposición de red. Todo estado propio vive en `./data/`.

## Dependencias

Superficie de ataque mínima por diseño: **3 dependencias de producción**
(`fastify`, `@fastify/static`, `better-sqlite3`). El resto son herramientas de
build/test (`vite`, `vitest`, `tailwind`…) que **no forman parte del runtime que
se ejecuta** (`pnpm serve` sirve el `dist` ya compilado vía Fastify).

Estado de `pnpm audit`:

- **Runtime: 0 vulnerabilidades.** Todo lo que toca la ejecución real está
  parcheado (`@fastify/static` ≥10.1.2, `fast-uri` ≥4.1.2 vía override en
  `pnpm-workspace.yaml`).
- **Dev/build: avisos residuales conocidos** en `vite`, `esbuild` y `vitest`.
  Se documentan en vez de forzar el upgrade porque:
  - Solo afectan al **dev server** (`pnpm dev` / `pnpm web`) y al runner de tests
    (`vitest run`), no al binario que sirve el dashboard.
  - El aviso *critical* de `vitest` requiere el **Vitest UI server** escuchando
    (`--ui`); este proyecto nunca lo lanza.
  - El aviso *high* de `vite` (`server.fs.deny` bypass) es **solo Windows** y
    **solo dev server**.
  - Explotar cualquiera exige a un atacante ya presente en la máquina del
    desarrollador golpeando un puerto local de desarrollo.
  - **Ruta de upgrade** (cierra los avisos, no urgente): migrar el toolchain a
    `vite` 8 + `@vitejs/plugin-react` 6 + `vitest` 4 — tres majors acoplados, se
    hará cuando toque mantenimiento del frontend, no como parche de seguridad.

Verificable en cualquier checkout limpio:

```bash
pnpm install --frozen-lockfile && pnpm audit
```

## Reportar una vulnerabilidad

Abre un issue en el repositorio describiendo el problema y cómo reproducirlo. Si
el detalle es sensible, indícalo en el issue y coordinamos un canal privado antes
de publicar detalles.
