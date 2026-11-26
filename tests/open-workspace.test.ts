import { createServer } from 'node:http';
import { eq } from 'drizzle-orm';
import { expect,it } from 'vitest';
import { createApp } from '../server/app.js';
import { postgresConfig } from '../server/config.js';
import { connectDemo } from '../server/db/connection.js';
import { organisations,users } from '../server/db/schema.js';
import { bootstrap } from '../server/db/seed.js';

it('opens the configured workspace without credentials and preserves the existing organisation',async()=>{
  const connection=await connectDemo(true);
  const db=connection.db;
  const origin='https://hub.example';
  const server=createServer(createApp(db,{...postgresConfig({APP_URL:origin}),serveFrontend:false}));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string') throw new Error('Expected a port.');
  const base='http://127.0.0.1:'+address.port+'/api';
  try {
    expect((await fetch(base+'/healthz')).status).toBe(503);
    const [org]=await db.insert(organisations).values({name:'Existing organisation'}).returning();
    const [previous]=await db.insert(users).values({orgId:org.id,name:'Previous admin',subject:'existing-admin',role:'hq_admin'}).returning();
    const shared=await bootstrap(db,{});
    expect(shared.orgId).toBe(org.id);
    expect((await bootstrap(db,{})).id).toBe(shared.id);
    expect(await db.select().from(users).where(eq(users.id,previous.id))).toHaveLength(1);
    expect(await (await fetch(base+'/healthz')).json()).toEqual({ready:true});
    expect((await (await fetch(base+'/workspace')).json()).organisation).toBe('Existing organisation');
    expect((await fetch(base+'/auth/get-session')).status).toBe(404);
    expect((await fetch(base+'/admin/profiles')).status).toBe(404);

    const write=(source:string)=>fetch(base+'/admin/centres',{method:'POST',
      headers:{origin:source,'content-type':'application/json'},
      body:JSON.stringify({code:'CENTRE',name:'New centre',active:true})
    });
    expect((await write('https://elsewhere.example')).status).toBe(403);
    expect((await write(origin)).status).toBe(201);
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await connection.close();
  }
},30000);
