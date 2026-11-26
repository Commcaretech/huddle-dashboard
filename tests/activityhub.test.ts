import { createServer } from 'node:http';
import { and,eq } from 'drizzle-orm';
import { expect,it } from 'vitest';
import { createApp } from '../server/app.js';
import { postgresConfig } from '../server/config.js';
import { connectDemo } from '../server/db/connection.js';
import { bootstrap } from '../server/db/seed.js';
import { centres,integrationSnapshots,periods,users,grants } from '../server/db/schema.js';
import { activityHubAdapter } from '../server/integrations/activityhub.js';
import { integratedReport } from '../server/integrations/reporting.js';
import { loadActor } from '../server/permissions.js';

const url='https://source.example/functions/v1/management-reporting/v1';
const apiKey='a'.repeat(64);
const operatorKey='b'.repeat(64);
const origin='https://hub.example';
const hash='c'.repeat(64);
const currentCentre='SEEN_NY';
const scope={centreId:currentCentre,from:'2090-01-01',to:'2090-02-01'};
const nullFields={hartRelated:null,description:null,subdomain:null,programmeCapacity:null};
const programmeId='ah-programme-v1:'+hash;
const venue={name:'Test hall',type:'Indoor',capacity:30};
const makeSession=(digit:string,status='scheduled')=>({
  id:'ah-session-v1:'+digit.repeat(64),programmeId,centreId:currentCentre,name:'Synthetic fitness programme',domain:'Physical',status,
  sessionDate:'2090-01-05',updatedAt:null,startTime:status==='cancelled'?null:'10:00',endTime:status==='cancelled'?null:'11:00',
  durationMinutes:status==='cancelled'?null:60,venues:status==='cancelled'?[]:[venue],frequency:'weekly',independentSession:false,
  plannedPax:status==='cancelled'?null:12,fitnessRelated:true,...nullFields
});
const programme={
  id:programmeId,centreId:currentCentre,name:'Synthetic fitness programme',kind:'series',domains:['Physical'],
  frequencies:['weekly'],sessionCount:2,templateCount:0,updatedAt:null,fitnessRelated:true,...nullFields
};
const summary={
  centreId:currentCentre,sessionCount:2,programmeCount:1,scheduledCount:1,tbcCount:0,cancelledCount:1,explicitlyCompletedCount:0,
  programmeMinutes:60,programmeHours:1,recordedPaxSessions:1,plannedPaxSum:12,
  byDomain:{Physical:1,Cognitive:0,Social:0,Learning:0,Volunteerism:0}
};

it('validates ActivityHub credentials, unavailable responses and malformed scoped pages',async()=>{
  let state='401';
  const adapter=activityHubAdapter({base:url,key:apiKey},async()=>state==='network'
    ?Promise.reject(new Error('network')): state==='invalid'?Response.json({data:[{}]}):new Response(null,{status:Number(state)}));
  await expect(adapter.test()).rejects.toMatchObject({code:'INVALID_CREDENTIALS'});
  state='502';
  await expect(adapter.test()).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE'});
  state='network';
  await expect(adapter.test()).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE'});
  state='invalid';
  await expect(adapter.get('sessions',scope)).rejects.toMatchObject({code:'INVALID_RESPONSE'});
});

it('syncs paged snapshots, revalidates by ETag, reconciles changes and preserves a successful snapshot on failure',async()=>{
  const connection=await connectDemo(true);
  const db=connection.db;
  const actor=await bootstrap(db,{organisation:'Integration test'});
  const [centre,other]=await db.insert(centres).values([
    {orgId:actor.orgId,code:'NY',name:'Test centre'},{orgId:actor.orgId,code:'OTHER',name:'Other centre'}
  ]).returning();
  const [period]=await db.insert(periods).values({orgId:actor.orgId,name:'January',kind:'Monthly',start:'2090-01-01',end:'2090-01-31'}).returning();
  const [previousPeriod]=await db.insert(periods).values({orgId:actor.orgId,name:'December',kind:'Monthly',start:'2089-12-01',end:'2089-12-31'}).returning();
  const [restricted]=await db.insert(users).values({orgId:actor.orgId,subject:'test-centre-viewer',name:'Centre viewer',role:'restricted_viewer'}).returning();
  await db.insert(grants).values({orgId:actor.orgId,centreId:other.id,userId:restricted.id});
  let mode='initial';
  const requests:{route:string;cursor:string|null;etag?:string}[]=[];
  async function mockFetch(input:URL,init:{headers:Record<string,string>}) {
    expect(init.headers.Authorization).toBe('Bearer '+apiKey);
    expect(init.headers).not.toHaveProperty('Origin');
    const route=input.pathname.split('/').at(-1) as string;
    const cursor=input.searchParams.get('cursor');
    requests.push({route,cursor,etag:init.headers['If-None-Match']});
    const envelope={datasetVersion:1,sourceSystem:'activityhub',retrievedAt:'2090-01-01T00:00:00.000Z',timezone:'Asia/Singapore',
      reportingDates:{centreId:input.searchParams.get('centreId'),from:input.searchParams.get('from'),toExclusive:input.searchParams.get('to'),domain:null,status:null}};
    if(route==='health') return Response.json({...envelope,totalCount:1,data:{status:'ok',sourceRead:'ok'}});
    if(route==='centres') return Response.json({...envelope,totalCount:2,data:[
      {centreId:currentCentre,name:'SEEN Nanyang',brand:'SEEN',location:'Nanyang'},
      {centreId:'GLOW_NY',name:'GLOW Nanyang',brand:'GLOW',location:'Nanyang'}
    ]});
    if(route==='datasets') return Response.json({...envelope,totalCount:5,
      data:['centres','programmes','sessions','upcoming','summary'].map(id=>({id,availability:'available',grain:'Synthetic contract fixture'})),
      unavailableFields:{description:'no_source_field',subdomain:'no_source_field',hartRelated:'no_verified_classification',
        completed:'no_completion_workflow',programmeCapacity:'no_dedicated_capacity_field',attendance:'no_source_dataset'}});
    if(mode==='unchanged'&&init.headers['If-None-Match']) return new Response(null,{status:304});
    if(mode==='failure'&&route==='sessions') return new Response(null,{status:502});
    let rows:unknown[]=route==='programmes'?[programme]:route==='summary'?[summary]:route==='upcoming'?(mode==='changed'?[]:[makeSession('d')]):[makeSession('d'),makeSession('e','cancelled')];
    if(mode==='changed'&&route==='sessions') rows=[makeSession('d','cancelled')];
    if(mode==='empty') rows=route==='summary'?[{...summary,sessionCount:0,programmeCount:0,scheduledCount:0,cancelledCount:0,
      programmeHours:0,programmeMinutes:0,recordedPaxSessions:0,plannedPaxSum:null,byDomain:{...summary.byDomain,Physical:0}}]:[];
    const page=route==='sessions'?rows.slice(cursor?1:0,cursor?2:1):rows;
    if(mode==='duplicate'&&route==='sessions'&&cursor) page[0]=makeSession('d');
    return Response.json({...envelope,totalCount:rows.length,data:page,snapshot:hash,
      page:{returnedCount:page.length,nextCursor:route==='sessions'&&!cursor&&rows.length>1?hash+'.1':null}},
      {headers:{ETag:'"'+hash+'"'}});
  }
  const server=createServer(createApp(db,{...postgresConfig({APP_URL:origin}),serveFrontend:false,
    integrationEnv:{ACTIVITYHUB_API_URL:url,ACTIVITYHUB_API_KEY:apiKey,INTEGRATION_OPERATOR_KEY:operatorKey},integrationFetch:mockFetch}));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string') throw new Error('Expected a port.');
  const base='http://127.0.0.1:'+address.port+'/api';
  const route='/admin/sources/activityhub';
  async function call(path:string,method='GET',body?:unknown,key=operatorKey){
    const response=await fetch(base+path,{method,headers:{origin,'content-type':'application/json','x-integration-operator-key':key},
      body:method==='GET'?undefined:JSON.stringify(body??{})});
    return {status:response.status,data:await response.json()};
  }
  async function sync(path=route+'/sync') {
    let result=await call(path,'POST',scope);
    expect(result.status).toBe(200);
    for(let step=0;step<8&&result.data.status==='running';step++){
      result=await call(route+'/sync/'+result.data.id+'/advance','POST');
      expect(result.status).toBe(200);
    }
    return result.data;
  }
  const report='/integrations/report/kpi-performance?periodId='+period.id+'&centreId='+centre.id;
  try {
    expect((await call(route+'/test','POST',{},'')).status).toBe(403);
    expect((await call(report,'GET',undefined,'')).status).toBe(403);
    const discovered=await call(route+'/test','POST');
    expect(discovered.data.connection).toBe('Connected');
    expect(discovered.data.datasets).toHaveLength(5);
    expect((await call(route,'PATCH',{enabled:true})).status).toBe(200);
    expect((await call(route+'/sync','POST',scope)).status).toBe(409);
    expect((await call(route+'/aliases','POST',{alias:currentCentre,centreId:centre.id})).status).toBe(201);
    expect((await call(route+'/aliases','POST',{alias:'GLOW_NY',centreId:centre.id})).status).toBe(409);
    expect((await call(route+'/preview','POST',scope)).data.totalCount).toBe(2);
    const opened=await call(route+'/sync','POST',scope);
    expect((await call(route+'/sync','POST',scope)).data.id).toBe(opened.data.id);
    expect((await call(route+'/sync','POST',{...scope,to:'2090-02-02'})).status).toBe(409);
    const first=await sync();
    expect(first.status).toBe('published');
    expect(first.counts).toMatchObject({inserted:5,updated:0,rejected:0});
    expect(requests.some(request=>request.route==='sessions'&&request.cursor===hash+'.1')).toBe(true);
    expect((await call(report)).data.metrics).toMatchObject({Programmes:1,Sessions:2,Cancelled:1,'Reported completed':null,'Planned pax':12});
    const planning='/integrations/report/next-two-weeks?periodId='+previousPeriod.id+'&centreId='+centre.id;
    expect((await call(planning)).data.sessions).toHaveLength(0);
    expect((await call('/integrations/report/hart?periodId='+period.id)).data.metrics).toBeNull();
    expect((await call(route+'/programme-flags','PUT',{externalCentre:currentCentre,externalId:programmeId,hart:true,highlight:true})).status).toBe(200);
    expect((await call(planning)).data.sessions).toHaveLength(1);
    expect((await call('/integrations/report/hart?periodId='+period.id)).data.metrics.Programmes).toBe(1);
    const scoped=await integratedReport(db,await loadActor(db,restricted.subject),{tab:'fitness',periodId:period.id,centreId:other.id});
    expect(scoped.metrics).toBeNull();
    expect(await db.select().from(integrationSnapshots).where(and(eq(integrationSnapshots.orgId,actor.orgId),eq(integrationSnapshots.centreId,centre.id)))).toHaveLength(1);
    mode='unchanged';
    const second=await sync('/admin/sources/sync-all');
    expect(second.counts).toEqual({retrieved:0,inserted:0,updated:0,rejected:0,removed:0});
    expect(requests.some(request=>request.etag==='"'+hash+'"')).toBe(true);
    mode='duplicate';
    expect((await sync()).status).toBe('failed');
    expect((await call(report)).data.metrics.Sessions).toBe(2);
    mode='failure';
    expect((await sync()).status).toBe('failed');
    expect((await call(report)).data.coverage[0].stale).toBe(true);
    mode='changed';
    const changed=await sync();
    expect(changed.counts).toMatchObject({updated:1,removed:2});
    expect((await call(report)).data.metrics).toMatchObject({Sessions:1,Cancelled:1,'Planned pax':null});
    mode='empty';
    expect((await sync()).status).toBe('published');
    expect((await call(report)).data.metrics.Sessions).toBe(0);
    expect((await call(route,'PATCH',{enabled:false})).status).toBe(200);
    expect((await call(report)).data.disabled).toBe(true);
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await connection.close();
  }
},45000);
