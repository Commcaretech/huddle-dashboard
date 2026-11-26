import { handleAuthProxyRequest } from '@neondatabase/auth/server';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { loadActor } from './permissions.js';

const signInInput = z.object({email:z.email().max(254),password:z.string().min(1).max(1024)}).strict();

export function installAuth(app, db, config) {
  function upstream(req, path, method = req.method) {
    const headers = new Headers();
    for (const key of ['cookie', 'content-type', 'origin', 'accept']) {
      if (typeof req.headers[key] === 'string') headers.set(key, req.headers[key]);
    }
    const body = path === 'sign-in/email' ? JSON.stringify(signInInput.parse(req.body)) : method === 'POST' ? '{}' : undefined;
    return handleAuthProxyRequest({
      request:new Request(new URL('/api/auth/' + path, config.appUrl), { method, headers, body }),
      path, baseUrl:config.authUrl, cookieSecret:config.secret, sameSite:'strict', sessionDataTtl:60
    });
  }

  if (!config.demo) {
    app.use('/api/auth', rateLimit({windowMs:900000, limit:40, standardHeaders:'draft-8', legacyHeaders:false}));
    for (const [method, path] of [['get','get-session'], ['post','sign-in/email'], ['post','sign-out']]) {
      app[method]('/api/auth/' + path, async (req, res) => {
        const response = await upstream(req, path);
        for (const cookie of response.headers.getSetCookie()) res.append('Set-Cookie',cookie);
        const type = response.headers.get('content-type');
        if (type) res.set('Content-Type',type);
        res.status(response.status).send(await response.text());
      });
    }
  }

  app.use('/api', async (req, res, next) => {
    let subject = config.demoSubject;
    if (!config.demo) {
      const response = await upstream(req, 'get-session', 'GET');
      if (response.status >= 500) return res.status(503).json({error:'Sign-in service is temporarily unavailable.'});
      const data = response.ok ? await response.json() : null;
      subject = data?.user?.id;
      if (!subject || data?.user?.emailVerified !== true) return res.status(401).json({error:'Sign in with a verified account.'});
    }
    req.actor = await loadActor(db, subject);
    if (!req.actor) return res.status(403).json({error:'This account needs an active reporting profile.'});
    next();
  });
}
