import { connectPostgres } from './postgres.js';
import { bootstrap } from './seed.js';
import { z } from 'zod';

const required = z.string().trim().min(1).max(160);
const config = z.object({organisation:required,subject:required,name:required}).parse({
  organisation:process.env.BOOTSTRAP_ORGANISATION, subject:process.env.BOOTSTRAP_ADMIN_SUBJECT,
  name:process.env.BOOTSTRAP_ADMIN_NAME
});
const connection = connectPostgres(process.env.DATABASE_URL_UNPOOLED);
try {
  await bootstrap(connection.db, config);
  console.log('Organisation administrator available.');
} finally {
  await connection.close();
}
