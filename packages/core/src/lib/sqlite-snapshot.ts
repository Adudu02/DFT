/**
 * Snapshot read-only de DBs SQLite vivas (workstream A2). Las fuentes son
 * WAL: se abren en readonly y se copian vía la API de backup de better-sqlite3
 * (consistente sin tocar sidecars a mano). Toda consulta corre sobre la copia;
 * la limpieza está garantizada en finally.
 */
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function withSqliteSnapshot<T>(
  srcPath: string,
  fn: (db: Database.Database) => T,
): Promise<T> {
  const tmpDir = mkdtempSync(join(tmpdir(), "motor-sqlite-"));
  const tmpPath = join(tmpDir, "snapshot.db");
  const src = new Database(srcPath, { readonly: true, fileMustExist: true });
  try {
    await src.backup(tmpPath);
  } finally {
    src.close();
  }
  const tmp = new Database(tmpPath, { readonly: true });
  try {
    return fn(tmp);
  } finally {
    tmp.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
