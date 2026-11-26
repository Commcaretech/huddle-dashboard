import { PGlite } from '@electric-sql/pglite';
import { drizzle as local } from 'drizzle-orm/pglite';
import { migrate as migrateLocal } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

export const migrationsFolder = fileURLToPath(new URL('../../migrations/', import.meta.url));
export async function connectDemo(inMemory = false) {
  const directory = fileURLToPath(new URL('../../data/demo-postgres', import.meta.url));
  if (!inMemory) await mkdir(directory, { recursive: true });
  const database = new PGlite(inMemory ? 'memory://' : directory);
  const db = local(database);
  await migrateLocal(db, { migrationsFolder });
  return { db, close: () => database.close() };
}
