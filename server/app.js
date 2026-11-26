import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import { fileURLToPath } from 'node:url';
import { loadActor } from './permissions.js';
import { reportRoutes, RequestError } from './report-routes.js';
import { adminRoutes } from './admin-routes.js';

const dist = fileURLToPath(new URL('../dist/',import.meta.url));
export function createApp(db, config) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy',1);
  app.use(helmet({
    contentSecurityPolicy:{directives:{imgSrc:["'self'",'data:','https:'],upgradeInsecureRequests:config.demo ? null : []}},
    strictTransportSecurity:config.demo ? false : undefined
  }));
  app.get(['/healthz','/api/healthz'], async (_req,res) => {
    res.set('Cache-Control','no-store');
    try { const actor = await loadActor(db,config.actorSubject); res.status(actor ? 200 : 503).json({ready:!!actor}); }
    catch (error) {
      console.error('Reporting database readiness check failed',error.cause?.code ?? error.code ?? error.name);
      res.status(503).json({ready:false});
    }
  });
  app.use('/api', (req,res,next) => {
    res.set('Cache-Control','no-store');
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    if (!config.allowedOrigins.includes(req.get('origin'))) return res.status(403).json({error:'Request origin is not allowed.'});
    if (!req.is('application/json')) return res.status(415).json({error:'Use a JSON request.'});
    next();
  });
  app.use('/api',rateLimit({windowMs:60000,limit:240,standardHeaders:'draft-8',legacyHeaders:false,
    message:{error:'Too many requests. Wait a minute and try again.'}}));
  app.use('/api',express.json({limit:'96kb'}));
  app.get('/api/config', (_req,res) => res.json({demo:config.demo}));
  app.use('/api', async (req,res,next) => {
    req.actor = await loadActor(db,config.actorSubject);
    if (!req.actor) return res.status(503).json({error:'The reporting workspace has not been initialised. Run the database setup command.'});
    next();
  });
  app.use('/api',adminRoutes(db,config),reportRoutes(db));
  app.use('/api', (_req,res) => res.status(404).json({error:'Endpoint was not found.'}));
  if (config.serveFrontend !== false) {
    app.use(express.static(dist));
    app.get(/.*/, (_req,res) => res.sendFile('index.html',{root:dist}));
  }
  app.use((error,_req,res,_next) => {
    if (error instanceof RequestError) return res.status(error.status).json({error:error.message});
    if (error instanceof ZodError) return res.status(400).json({error:error.issues.map(issue => [issue.path.join('.'),issue.message].filter(Boolean).join(' · ')).join(' ')});
    if ((error.cause?.code || error.code) === '23505') return res.status(409).json({error:'A record with those identifiers already exists.'});
    if (error.type === 'entity.too.large') return res.status(413).json({error:'Request is too large.'});
    if (error.type === 'entity.parse.failed') return res.status(400).json({error:'Request JSON is invalid.'});
    console.error('Request failed',error.name,error.cause?.code ?? error.code ?? '');
    res.status(500).json({error:'The request could not be completed.'});
  });
  return app;
}
