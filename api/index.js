import express from 'express';
import { postgresConfig, WorkspaceConfigError } from '../server/config.js';

let appPromise;

async function initialise(env) {
  const config = postgresConfig(env);
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) throw new WorkspaceConfigError('MISSING_DATABASE_URL','Set DATABASE_URL to the pooled Neon connection URL in Vercel Production.');
  const database = URL.parse(connectionString);
  if (!database || !['postgres:','postgresql:'].includes(database.protocol) || !database.hostname || !database.username) {
    throw new WorkspaceConfigError('INVALID_DATABASE_URL','DATABASE_URL must contain the full PostgreSQL connection URL from Neon.');
  }
  const [{ createApp }, { connectPostgres }, { attachDatabasePool }] = await Promise.all([
    import('../server/app.js'),
    import('../server/db/postgres.js'),
    import('@vercel/functions')
  ]);
  const connection = connectPostgres(connectionString, { max:2, idleTimeoutMillis:5000 });
  try {
    attachDatabasePool(connection.pool);
    return createApp(connection.db, { ...config, trustProxy:true, serveFrontend:false });
  } catch (error) {
    await connection.close();
    throw error;
  }
}

async function handler(req, res) {
  let app;
  const pendingApp = appPromise ??= initialise(process.env);
  try {
    app = await pendingApp;
  } catch (error) {
    if (appPromise === pendingApp) appPromise = undefined;
    const configurationError = error instanceof WorkspaceConfigError;
    const code = configurationError ? error.code : 'FUNCTION_STARTUP_FAILED';
    const message = configurationError ? error.message : 'The reporting service could not start. Check the Vercel runtime logs.';
    console.error('Reporting function failed to initialise',code,configurationError ? message : error?.code ?? error?.name);
    res.statusCode = 503;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    return res.end(JSON.stringify({ error:message, code }));
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

// A native Express entry point lets Express consume request bodies directly.
const entrypoint = express();
entrypoint.disable('x-powered-by');
entrypoint.use(handler);
export default entrypoint;
