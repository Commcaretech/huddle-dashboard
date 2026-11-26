import { connectPostgres } from './postgres.js';
import { bootstrap } from './seed.js';
import { z } from 'zod';

const organisationName = z.string().trim().min(1).max(160).optional();
const config = z.object({organisation:organisationName,orgId:z.uuid().optional()}).parse({
  organisation:process.env.BOOTSTRAP_ORGANISATION || undefined,
  orgId:process.env.BOOTSTRAP_ORGANISATION_ID || undefined
});
const connection = connectPostgres(process.env.DATABASE_URL_UNPOOLED);
try {
  await bootstrap(connection.db, config);
  console.log('Shared workspace available.');
} finally {
  await connection.close();
}
