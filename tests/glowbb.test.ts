import {createServer} from 'node:http';
import {and,eq} from 'drizzle-orm';
import {expect,it} from 'vitest';
import {createApp} from '../server/app.js';
import {postgresConfig} from '../server/config.js';
import {connectDemo} from '../server/db/connection.js';
import {bootstrap} from '../server/db/seed.js';
import {centres,periods,sources,integrationSnapshots} from '../server/db/schema.js';
import {glowAdapter,glowConfig} from '../server/integrations/glowbb.js';

const origin='https://hub.example';
const base='https://glow.example/api/reporting/v1';
const secret='synthetic-upstream-test-key-012345678';
const operator='a'.repeat(64);
const env={GLOWBB_REPORTING_BASE_URL:base,GLOWBB_API_KEY:secret,INTEGRATION_OPERATOR_KEY:operator};
const centre='glow_bukit_batok';
const dates={from:'2025-02-01',to:'2025-02-28'};
const historyDates={from:'2025-01-01',to:'2025-02-28'};
const cell=(value:number|null,status='available',unit='people')=>({value,status,unit});
const definition=(id:string,unit='people')=>({id,displayName:id,description:'Synthetic source definition',unit,methodology:'Authoritative source methodology',
  supportedFilters:['from','to'],aggregation:'Distinct within source scope',dataSource:'Synthetic source',availability:'source_present',availableDateRange:historyDates});
const tabs=[
  {id:'summary',metrics:[definition('unique'),definition('attendance','entries'),definition('repeatRate','percent'),definition('unknownNumeric')]},
  {id:'programmes',metrics:[definition('attendance','entries')]},
  {id:'health-assessments',metrics:[definition('reportedTotal','assessments'),definition('coverage','percent')]},
  {id:'fitness',classifications:['Fitness','Gym Tonic'],metrics:[definition('attendance','entries')]}
].map(dataset=>({...dataset,supportedFilters:['from','to']}));

it('requires the documented base and key and handles authentication and source failures',async()=>{
  expect(glowConfig({...env,GLOWBB_REPORTING_BASE_URL:'https://glow.example/health'})).toBeNull();
  expect(glowConfig({...env,GLOWBB_API_KEY:'short'})).toBeNull();
  const config=glowConfig(env);
  expect(config?.base).toBe(base);
  for(const [status,code] of [[401,'INVALID_CREDENTIALS'],[403,'CENTRE_NOT_ALLOWED'],[503,'SOURCE_UNAVAILABLE']] as const){
    const adapter=glowAdapter(config,async()=>new Response(null,{status}));
    await expect(adapter.test()).rejects.toMatchObject({code});
  }
  const adapter=glowAdapter(config,async()=>Response.json({workspaceAvailable:false}));
  await expect(adapter.test()).rejects.toMatchObject({code:'INVALID_RESPONSE'});
});

it('discovers approved metrics, persists exact and historical reports, and preserves last good data',async()=>{
  const connection=await connectDemo(true);
  const db=connection.db;
  const actor=await bootstrap(db,{organisation:'Synthetic reporting'});
  const [glow,other]=await db.insert(centres).values([
    {orgId:actor.orgId,code:'GLOW_BB',name:'GLOW Bukit Batok'},
    {orgId:actor.orgId,code:'SEEN_NY',name:'SEEN Nanyang'}
  ]).returning();
  const [period,earlier,broad]=await db.insert(periods).values([
    {orgId:actor.orgId,name:'Feb',kind:'Monthly',start:dates.from,end:dates.to},
    {orgId:actor.orgId,name:'Jan',kind:'Monthly',start:historyDates.from,end:'2025-01-31'},
    {orgId:actor.orgId,name:'Coverage',kind:'Custom',start:historyDates.from,end:historyDates.to}
  ]).returning();
  const [legacy]=await db.insert(sources).values({orgId:actor.orgId,key:'activityhub',enabled:true}).returning();
  await db.insert(integrationSnapshots).values({orgId:actor.orgId,sourceId:legacy.id,centreId:glow.id,externalCentre:'GLOW_BB',
    fromDate:dates.from,toDate:dates.to,data:{old:true},refreshedAt:new Date()});
  let failure=false;
  let duplicate=false;
  let wrongCentre=false;
  const requested:string[]=[];
  async function fetcher(url:URL,init:{headers:Record<string,string>}) {
    expect(init.headers.Authorization).toBe('Bearer '+secret);
    expect(url.searchParams.get('centre')).toBe(centre);
    const dataset=url.pathname.split('/').at(-1);
    requested.push(dataset+'?'+url.searchParams.toString());
    const from=url.searchParams.get('from'),to=url.searchParams.get('to');
    const filters=Object.fromEntries(url.searchParams);
    const header={sourceSystem:'GlowBBDashboard',centreId:wrongCentre?'seen_nanyang':centre,centreName:'GLOW Bukit Batok',
      dataset,schemaVersion:'1.0',timezone:'Asia/Singapore',period:from&&to?{from,to}:null,appliedFilters:filters,
      dataLastUpdatedAt:null,dataRetrievedAt:new Date().toISOString()};
    if(dataset==='health') return Response.json({...header,status:'ready',workspaceAvailable:true});
    if(dataset==='datasets') return Response.json({...header,datasets:tabs});
    if(failure&&dataset==='programmes')return new Response(null,{status:502});
    if(dataset==='summary'){
      const prior=from?.startsWith('2024');
      return Response.json({...header,coverageStatus:prior?'missing':'within_observed_range',metrics:{
        unique:prior?cell(null,'missing'):cell(10),
        attendance:prior?cell(null,'missing','entries'):cell(from===dates.from?11:21,'available','entries'),
        repeatRate:{...cell(null,'suppressed','percent'),numerator:3,denominator:10},
        unknownNumeric:cell(999),memberId:'private-member'
      },previous:null});
    }
    if(dataset==='health-assessments')return Response.json({...header,assessments:{
      SPPB:{metrics:{reportedTotal:cell(null,'missing','assessments')},linked:{coverage:{...cell(50,'available','percent'),numerator:5,denominator:10}},
        monthly:[],reportedMonths:0,selectedMonths:1,records:[{memberId:'private-member'}]},
      TANITA:{metrics:{reportedTotal:cell(0,'available','assessments')},monthly:[],reportedMonths:1,selectedMonths:1}
    }});
    const page=Number(url.searchParams.get('page'));
    const total=dataset==='programmes'?51:1;
    const size=page===1?Math.min(total,50):1;
    const rows=Array.from({length:size},(_,i)=>({programme:String(duplicate&&page===2?1:((page-1)*50+i+1)),name:'Synthetic programme',
      rank:(page-1)*50+i+1,primaryDomain:'Physical',domains:['Physical'],subdomains:[filters.subdomain??'Fitness'],
      metrics:{attendance:cell(11,'available','entries')},previous:null,monthly:[],memberId:'private-member'}));
    return Response.json({...header,metrics:{attendance:cell(11,'available','entries')},previous:null,rows,pagination:{page,limit:50,total}});
  }
  const app=createApp(db,{...postgresConfig({APP_URL:origin}),serveFrontend:false,integrationEnv:env,integrationFetch:fetcher});
  const server=createServer(app);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Expected TCP port');
  const endpoint='http://127.0.0.1:'+address.port+'/api';
  const route='/admin/sources/glowbb';
  async function call(path:string,method='GET',body?:unknown,key=operator){
    const response=await fetch(endpoint+path,{method,headers:{origin,'content-type':'application/json','x-integration-operator-key':key},
      body:method==='GET'?undefined:JSON.stringify(body??{})});
    return {status:response.status,data:await response.json()};
  }
  async function finish(job:any){
    for(let step=0;step<60&&job.status==='running';step++){
      const result=await call(route+'/sync/'+job.id+'/advance','POST');
      expect(result.status).toBe(200);
      job=result.data;
    }
    return job;
  }
  const report=(tab='kpi-performance',selected=period.id,centreId=glow.id)=>'/integrations/report/'+tab+'?periodId='+selected+(centreId?'&centreId='+centreId:'');
  try {
    expect((await call(route+'/test','POST',{},'')).status).toBe(403);
    expect((await call(report(),'GET',undefined,'')).status).toBe(403);
    const registry=await call('/admin/sources');
    expect(registry.data.sources.some((source:{key:string})=>source.key==='activityhub')).toBe(false);
    expect((await call('/admin/sources/activityhub/test','POST')).status).toBe(404);
    expect((await call(route+'/test','POST')).data.connection).toBe('Connected');
    expect((await call(route,'PATCH',{enabled:true})).status).toBe(200);
    expect((await call(route+'/aliases','POST',{alias:centre,centreId:other.id})).status).toBe(400);
    expect((await call(route+'/aliases','POST',{alias:centre,centreId:glow.id})).status).toBe(201);
    expect((await call(route+'/preview','POST',dates)).data.metadata.metrics.attendance.value).toBe(11);
    expect((await call(route+'/sync','POST',{from:'2090-01-01',to:'2090-01-02'})).status).toBe(400);
    wrongCentre=true;
    expect((await call(route+'/preview','POST',dates)).status).toBe(502);
    wrongCentre=false;
    const opened=await call('/admin/sources/sync-all','POST',dates);
    expect(opened.status).toBe(200);
    expect((await call(route+'/sync','POST',dates)).data.id).toBe(opened.data.id);
    expect((await call(route+'/sync','POST',historyDates)).status).toBe(409);
    const completed=await finish(opened.data);
    expect(completed.status).toBe('published');
    expect(requested.some(path=>path.startsWith('programmes?')&&path.includes('page=2'))).toBe(true);
    expect(requested.some(path=>path.startsWith('fitness?')&&path.includes('Gym+Tonic'))).toBe(true);
    const live=await call(report());
    const summary=live.data.datasets.find((item:{key:string})=>item.key==='summary');
    expect(summary.meta.metrics).toMatchObject({unique:{value:10},attendance:{value:11},repeatRate:{value:null,numerator:null,denominator:null}});
    expect(summary.meta.metrics.unknownNumeric).toBeUndefined();
    expect(summary.definitions[0].methodology).toBe('Authoritative source methodology');
    expect(JSON.stringify(live.data)).not.toContain('private-member');
    const health=(await call(report('health-data'))).data.datasets[0].rows;
    expect(health.find((item:{id:string})=>item.id==='TANITA').metrics.reportedTotal.value).toBe(0);
    expect(health.find((item:{id:string})=>item.id==='SPPB').linked.coverage.value).toBe(50);
    expect((await call(report('kpi-performance',period.id,other.id))).data.datasets).toHaveLength(0);
    expect((await call(report('kpi-performance',period.id,''))).data.partial).toBe(true);
    expect((await call(report('kpi-performance',earlier.id))).data.datasets).toHaveLength(0);
    const second=await finish((await call(route+'/sync','POST',dates)).data);
    expect(second.counts).toMatchObject({inserted:0,updated:0,removed:0});
    duplicate=true;
    expect((await finish((await call(route+'/sync','POST',dates)).data)).status).toBe('failed');
    duplicate=false;
    failure=true;
    expect((await finish((await call(route+'/sync','POST',dates)).data)).status).toBe('failed');
    expect((await call(report())).data.stale).toBe(true);
    expect((await call(report())).data.datasets.find((item:{key:string})=>item.key==='summary').meta.metrics.unique.value).toBe(10);
    failure=false;
    const historical=await call(route+'/historical','POST');
    expect(historical.data.progress.scope).toMatchObject(historyDates);
    expect((await finish(historical.data)).status).toBe('published');
    expect((await call(report('kpi-performance',broad.id))).data.datasets.find((item:{key:string})=>item.key==='summary').meta.metrics.attendance.value).toBe(21);
    expect((await call(report('kpi-performance',earlier.id))).data.datasets.find((item:{key:string})=>item.key==='summary').meta.metrics.unique.value).toBe(10);
    expect(await db.select().from(integrationSnapshots).where(and(eq(integrationSnapshots.orgId,actor.orgId),eq(integrationSnapshots.sourceId,legacy.id)))).toHaveLength(1);
  } finally{
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await connection.close();
  }
},60000);
