import { z } from 'zod';
import { connectDemo } from './db/connection.js';
import { connectPostgres } from './db/postgres.js';
import { seedDemo, demoSubject } from './db/seed.js';
import { createApp } from './app.js';
import { postgresConfig } from './config.js';

const production = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
const mode = z.enum(['demo','postgres']).parse(process.env.HUB_MODE ?? (production ? 'postgres' : 'demo'));
const demo = mode === 'demo';
if (production && demo) throw new Error('Hosted environments require PostgreSQL.');
const port = z.coerce.number().int().min(1).max(65535).parse(process.env.PORT ?? 3001);
const config = demo ? {
  demo, actorSubject:demoSubject,
  allowedOrigins:[new URL(process.env.APP_URL || 'http://127.0.0.1:5173').origin,
    'http://127.0.0.1:' + port,'http://localhost:' + port,'http://localhost:5173','http://127.0.0.1:5173']
} : postgresConfig(process.env);
const connection = demo ? await connectDemo(process.env.HUB_DEMO_MEMORY === 'true') : connectPostgres(process.env.DATABASE_URL);
if (demo) await seedDemo(connection.db);
const app = createApp(connection.db,config);
const server = app.listen(port, production ? '0.0.0.0' : '127.0.0.1', () => {
  console.log('Management Hub API listening on port ' + port + (demo ? ' (local demonstration)' : ''));
});
for (const signal of ['SIGINT','SIGTERM']) {
  process.once(signal, () => server.close(() => void connection.close()));
}
