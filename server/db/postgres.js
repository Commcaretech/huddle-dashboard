import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export function connectPostgres(connectionString, options = {}) {
  if (!connectionString) throw new Error('A PostgreSQL connection URL is required.');
  const pool = new pg.Pool({ connectionString, max:5, connectionTimeoutMillis:5000, ...options });
  pool.on('error', error => console.error('Idle PostgreSQL connection failed', error.code ?? error.name));
  return { db:drizzle(pool), pool, close:() => pool.end() };
}
