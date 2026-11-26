import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { connectPostgres } from './postgres.js';
import { migrationsFolder } from './connection.js';

const connection = connectPostgres(process.env.DATABASE_URL_UNPOOLED);
try {
  await migrate(connection.db, { migrationsFolder });
  console.log('Migrations applied.');
} finally {
  await connection.close();
}
