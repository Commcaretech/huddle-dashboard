import express from 'express';

let appPromise;

async function initialise(env) {
  const { postgresConfig } = await import('../server/config.js');
  const config = postgresConfig(env);
  const [{ createApp }, { connectPostgres }, { attachDatabasePool }] = await Promise.all([
    import('../server/app.js'),
    import('../server/db/postgres.js'),
    import('@vercel/functions')
  ]);
  const connection = connectPostgres(env.DATABASE_URL, { max:2, idleTimeoutMillis:5000 });
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
  try {
    appPromise ??= initialise(process.env);
    app = await appPromise;
  } catch (error) {
    appPromise = undefined;
    console.error('Reporting function failed to initialise', error?.code ?? error?.name);
    res.statusCode = 503;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    return res.end(JSON.stringify({ error:'The reporting service could not start. Check the Vercel runtime logs.' }));
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
