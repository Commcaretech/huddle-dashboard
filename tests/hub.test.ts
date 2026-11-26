import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { and,eq } from 'drizzle-orm';
import { actionHistory, centres, entries, grants, organisations, users } from '../server/db/schema.js';
import { connectDemo } from '../server/db/connection.js';
import { demoSubject,seedDemo } from '../server/db/seed.js';
import { createApp } from '../server/app.js';
import { canManage,canWrite,centreScope,loadActor } from '../server/permissions.js';
import { normalisedMetric } from '../server/integrations/contracts.js';
import { addDays,dateWindow,fiscalYear,fortnight,singaporeToday,tabs } from '../shared/reporting.js';

const origin='http://127.0.0.1:5173';
let connection:Awaited<ReturnType<typeof connectDemo>>;
let server:Server;
let url:string;

beforeAll(async()=>{
  connection=await connectDemo(true);
  await seedDemo(connection.db);
  server=createServer(createApp(connection.db,{demo:true,actorSubject:demoSubject,allowedOrigins:[origin]}));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string') throw new Error('Expected a port.');
  url='http://127.0.0.1:'+address.port;
},30000);
afterAll(async()=>{
  if(server) await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  if(connection) await connection.close();
});

async function call(path:string,method='GET',body?:unknown,requestOrigin=origin) {
  const response=await fetch(url+'/api'+path,{method,headers:{origin:requestOrigin,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,data:await response.json()};
}

describe('reporting dates',()=>{
  it('uses Singapore midnight and anchored fortnights across calendar years',()=>{
    expect(singaporeToday(new Date('2026-11-25T16:01:00Z'))).toBe('2026-11-26');
    expect(fortnight('2025-12-31','2026-01-05')).toEqual({start:'2025-12-22',end:'2026-01-04'});
    expect(fiscalYear('2026-03-31',4)).toBe(2025);
    expect(dateWindow('next-two-weeks',{start:'2026-02-15',end:'2026-02-28'})).toEqual({start:'2026-03-01',end:'2026-03-14'});
    expect(dateWindow('next-three-months',{start:'2026-01-16',end:'2026-01-30'})).toEqual({start:'2026-01-31',end:'2026-04-29'});
  });
});
describe('integration contract',()=>{
  it('accepts explicitly reported zero and rejects missing values and inverted bounds',()=>{
    const input={externalId:'external-1',centreAlias:'CENTRE',metricKey:'occurrences.scheduled',periodStart:'2026-01-01',periodEnd:'2026-01-14',value:'0',unit:'sessions',dimensions:{},methodology:'Count of scheduled occurrences.',sourceUpdatedAt:'2026-02-01T00:00:00Z',schemaVersion:1};
    expect(normalisedMetric.safeParse(input).success).toBe(true);
    expect(normalisedMetric.safeParse({...input,value:undefined}).success).toBe(false);
    expect(normalisedMetric.safeParse({...input,periodEnd:'2025-01-14'}).success).toBe(false);
  });
});
describe('database and API',()=>{
  it('provides thirteen routes and creates a shared development with a single ID',async()=>{
    const {data:workspace}=await call('/workspace');
    const first=workspace.periods[0];
    expect(tabs).toHaveLength(13);
    for (const tab of tabs) expect((await call("/reports/"+tab.id+"?periodId="+first.id)).status).toBe(200);
    const centre=workspace.centres[0].id;
    const input={centreId:centre,periodId:first.id,kind:'development',title:'New partnership',category:'Partner meeting',status:'Planned',date:addDays(first.end,2),dueDate:null,details:{description:'Discuss a shared programme.',highlight:true}};
    const saved=await call('/entries','POST',input);
    expect(saved.status).toBe(201);
    for(const tab of ['next-two-weeks','next-three-months']){
      const {status,data}=await call('/reports/'+tab+'?periodId='+first.id);
      expect(status).toBe(200);
      expect(data.rows.some((row:{id:string})=>row.id===saved.data.id)).toBe(true);
    }
    const recent=await call('/reports/recent-developments?periodId='+first.id);
    expect(recent.data.rows.some((row:{id:string})=>row.id===saved.data.id)).toBe(false);
    expect((await call('/entries/'+saved.data.id,'PATCH',{archived:true})).status).toBe(200);
    const archived=await call('/reports/next-two-weeks?archived=true&periodId='+first.id);
    expect(archived.data.rows.some((row:{id:string})=>row.id===saved.data.id)).toBe(true);
  });
  it('validates conclusions, carries open actions forward, and records completion history',async()=>{
    const {data:workspace}=await call('/workspace');
    const [current,previous]=workspace.periods;
    const common={centreId:workspace.centres[0].id,periodId:previous.id,tab:'kpi-performance'};
    expect((await call('/conclusions','POST',{...common,type:'For information only',summary:' '})).status).toBe(400);
    expect((await call('/conclusions','POST',{...common,type:'For information only',summary:'Summary'},'https://elsewhere.example')).status).toBe(403);
    const saved=await call('/conclusions','POST',{...common,type:'Discussion and action required',observation:'Evidence needs confirmation',evidence:'Reviewed count sheet',implications:'Wait before reporting',recommendation:'Confirm count sheet',owner:'Review team',priority:'High',dueDate:current.end});
    expect(saved.status).toBe(201);
    const {data}=await call('/actions?periodId='+current.id+'&owner=review&priority=High');
    const row=data.rows.find((item:{conclusionId:string})=>item.conclusionId===saved.data.id);
    expect(row.carriedForward).toBe(true);
    expect((await call('/actions/'+row.id,'PATCH',{status:'Completed',progress:90,evidence:''})).status).toBe(400);
    expect((await call('/actions/'+row.id,'PATCH',{status:'Completed',progress:100,evidence:'Validated total with team'})).status).toBe(200);
    expect(await connection.db.select().from(actionHistory).where(eq(actionHistory.actionId,row.id))).toHaveLength(2);
    expect((await call('/actions?periodId='+current.id+'&status=All+actions&owner=review')).data.rows).toHaveLength(0);
  });
  it('scopes role and centre access to the actor organisation and grants',async()=>{
    const db=connection.db;
    const admin=await loadActor(db,demoSubject);
    const [ownCentre,otherCentre]=admin.centres;
    const [foreignOrg]=await db.insert(organisations).values({name:'Other organisation'}).returning();
    const [foreignCentre]=await db.insert(centres).values({orgId:foreignOrg.id,name:'Foreign centre',code:'FOREIGN'}).returning();
    const [staff]=await db.insert(users).values({orgId:admin.orgId,subject:'scoped-staff',name:'Scoped staff',role:'centre_staff'}).returning();
    await db.insert(grants).values({orgId:admin.orgId,centreId:ownCentre.id,userId:staff.id});
    await expect(db.insert(grants).values({orgId:admin.orgId,centreId:foreignCentre.id,userId:staff.id})).rejects.toThrow();
    const actor=await loadActor(db,staff.subject);
    expect(actor.centres.map((row:{id:string})=>row.id)).toEqual([ownCentre.id]);
    expect(await db.select().from(entries).where(centreScope(actor,entries,otherCentre.id))).toHaveLength(0);
    expect(await db.select().from(entries).where(and(centreScope(actor,entries),eq(entries.centreId,foreignCentre.id)))).toHaveLength(0);
    expect(canWrite(actor.role)).toBe(true);
    expect(canManage(actor.role)).toBe(false);
    expect(canWrite('restricted_viewer')).toBe(false);
    expect(canWrite('hq_viewer')).toBe(false);
  });
});
