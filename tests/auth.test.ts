import { createServer, type Server } from 'node:http';
import { NEON_AUTH_SESSION_COOKIE_NAME } from '@neondatabase/auth/server';
import { eq } from 'drizzle-orm';
import { expect,it } from 'vitest';
import { createApp } from '../server/app.js';
import { connectDemo } from '../server/db/connection.js';
import { centres,grants,users } from '../server/db/schema.js';
import { demoSubject,seedDemo } from '../server/db/seed.js';

async function listen(server:Server) {
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string') throw new Error('Expected a TCP port.');
  return 'http://127.0.0.1:'+address.port;
}

it('gates the production API behind the Neon SDK session, verified profile, and permissions',async()=>{
  const connection=await connectDemo(true);
  const db=connection.db;
  const provider=createServer((req,res)=>{
    const scenario=req.headers.cookie?.split('=')[1];
    const subject=scenario==='unknown'?'unknown-subject':scenario==='viewer'?'test-viewer':demoSubject;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify(scenario ? {
      user:{id:subject,emailVerified:scenario!=='unverified'},
      session:{id:'test-session',userId:subject,expiresAt:new Date(Date.now()+60000).toISOString()}
    }:null));
  });
  let appServer:Server|undefined;
  try {
    await seedDemo(db);
    const [admin]=await db.select().from(users).where(eq(users.subject,demoSubject));
    const [centre]=await db.select().from(centres).where(eq(centres.orgId,admin.orgId));
    const [viewer]=await db.insert(users).values({orgId:admin.orgId,role:'restricted_viewer',subject:'test-viewer',name:'Test viewer'}).returning();
    await db.insert(grants).values({orgId:admin.orgId,userId:viewer.id,centreId:centre.id});
    const authUrl=await listen(provider);
    const origin='https://hub.example';
    appServer=createServer(createApp(db,{demo:false,appUrl:origin,authUrl,secret:'a-local-test-secret-of-at-least-32-characters',allowedOrigins:[origin],serveFrontend:false}));
    const base=await listen(appServer);
    async function request(path:string,scenario?:string,method='GET') {
      return fetch(base+'/api'+path,{method,headers:{origin,'content-type':'application/json',...(scenario?{cookie:NEON_AUTH_SESSION_COOKIE_NAME+'='+scenario}:{})},
        body:method==='POST'?'{}':undefined});
    }
    const health = await request('/healthz');
    expect(await health.json()).toEqual({ready:true});
    expect((await fetch(base+'/next-two-weeks')).status).toBe(404);
    expect((await request('/workspace')).status).toBe(401);
    expect((await request('/workspace','unverified')).status).toBe(401);
    expect((await request('/workspace','unknown')).status).toBe(403);
    const allowed=await request('/workspace','viewer');
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).centres.map((item:{id:string})=>item.id)).toEqual([centre.id]);
    expect((await request('/entries','viewer','POST')).status).toBe(403);
    expect((await request('/admin/sources','viewer')).status).toBe(403);
    expect((await request('/admin/sources','admin')).status).toBe(200);
    expect((await request('/auth/sign-up/email','admin','POST')).status).toBe(404);
  } finally {
    if(appServer) await new Promise<void>(resolve=>appServer.close(()=>resolve()));
    if(provider.listening) await new Promise<void>(resolve=>provider.close(()=>resolve()));
    await connection.close();
  }
},30000);
