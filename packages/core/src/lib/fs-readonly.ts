/**
 * Acceso SOLO LECTURA a las fuentes (PLAN §0). Se abre siempre con flag 'r':
 * nunca crea ni trunca. Toda escritura vive en ./data (state.ts / config / etc).
 */
import { readFile, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";

/** Lee un archivo de una fuente read-only. Flag 'r' => falla si no existe, jamás escribe. */
export function readFileRO(path: string): Promise<string> {
  return readFile(path, { encoding: "utf8", flag: "r" });
}

/** Lista un directorio de una fuente read-only. */
export function readDirRO(path: string): Promise<Dirent[]> {
  return readdir(path, { withFileTypes: true });
}
