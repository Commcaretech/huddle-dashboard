import { attachDatabasePool } from '@vercel/functions';
import { createApp } from '../server/app.js';
import { postgresConfig } from '../server/config.js';
import { connectPostgres } from '../server/db/postgres.js';

let app;
export default function handler(req, res) {
  if (!app) {
    try {
      const config = postgresConfig(process.env);
      const { db, pool } = connectPostgres(process.env.DATABASE_URL, { max:2, idleTimeoutMillis:5000 });
      attachDatabasePool(pool);
      app = createApp(db, { ...config, trustProxy:true, serveFrontend:false });
    } catch {
      res.statusCode = 503;
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.setHeader('Cache-Control','no-store');
      return res.end(JSON.stringify({ error:'The reporting service is not configured.' }));
    }
  }

  // Restore the API path if the platform supplies the rewrite destination.
  const url = new URL(req.url, 'http://localhost');
  const route = url.searchParams.get('__hub_route');
  if (url.pathname === '/api/index' && route) {
    url.searchParams.delete('__hub_route');
    req.url = '/api/' + route.split('/').map(encodeURIComponent).join('/') + url.search;
    // The platform may already have attached a lazy query parser to the old URL.
    delete req.query;
  }
  return app(req, res);
}
