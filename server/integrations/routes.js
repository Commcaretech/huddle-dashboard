import { Router } from 'express';
import { and,desc,eq } from 'drizzle-orm';
import { z } from 'zod';
import { aliases,integrationDatasets,integrationIssues,integrationSnapshots,periods,sources,syncJobs } from '../db/schema.js';
import { requireAccess,RequestError,log } from '../report-routes.js';
import { selection,short,uid } from '../validation-hub.js';
import { singaporeToday } from '../../shared/reporting.js';
import { sourceRegistry } from './contracts.js';
import { SourceError } from './source-error.js';
import { historicalScope } from './glowbb.js';
import { glowCentre,glowSource,glowTabs } from './glowbb-metrics.js';
import { requireIntegrationAccess } from './access.js';
import { integrationAdapters } from './registry.js';
import { advanceSync,getSource,history,publicJob,startSync } from './sync.js';
import { integratedReport,isGlowHubCentre } from './reporting.js';

const scopeInput=z.object({from:z.iso.date(),to:z.iso.date()}).strict();
const sourcePath='/admin/sources/glowbb';

function validateDates(scope) {
  if(scope.from>scope.to||scope.to>singaporeToday()||(Date.parse(scope.to)-Date.parse(scope.from))/86400000>3653) {
    throw new RequestError(400,'Use inclusive dates through today and a range of at most 10 years.');
  }
  return {...scope,centreId:glowCentre};
}

function releasedMetrics(data) {
  const result={};
  for(const dataset of Object.values(data??{})){
    const rows=dataset.rows??[];
    const id=rows[0]?.dataset;
    if(!id)continue;
    const names=new Set(result[id]);
    for(const row of rows){
      for(const cells of [row.metrics,row.linked]){
        for(const [key,cell] of Object.entries(cells??{})) if(cell.status==='available') names.add(key);
      }
    }
    result[id]=[...names].sort();
  }
  return result;
}

export function integrationRoutes(db,config) {
  const router=Router();
  const env=config.integrationEnv??process.env;
  const adapters=integrationAdapters(env,config.integrationFetch);
  const glow=adapters.get(glowSource);
  router.get('/integrations/report/:tab',async(req,res)=>{
    requireIntegrationAccess(req,env);
    const query=selection.required({periodId:true}).parse(req.query);
    requireAccess(!query.centreId||req.actor.centres.some(centre=>centre.id===query.centreId));
    res.json(await integratedReport(db,req.actor,{...query,tab:req.params.tab,approvedHart:glow.approvedHart}));
  });
  router.use('/admin/sources',(req,_res,next)=>{
    requireAccess(req.actor.role==='hq_admin');
    if(req.method!=='GET'||req.path!=='/') requireIntegrationAccess(req,env);
    next();
  });
  function known(key) {
    const adapter=adapters.get(key);
    if(!adapter) throw new RequestError(404,'Source was not found.');
    return adapter;
  }
  async function sourceFor(actor,key,create=false) {
    known(key);
    if(create) await db.insert(sources).values({orgId:actor.orgId,key}).onConflictDoNothing();
    const source=await getSource(db,actor,key);
    if(!source) throw new RequestError(409,'Configure the source first.');
    return source;
  }
  async function catalogue(sourceId) {
    const [row]=await db.select().from(integrationDatasets).where(and(eq(integrationDatasets.sourceId,sourceId),eq(integrationDatasets.key,'__catalogue')));
    return row?.definition?.datasets??[];
  }
  async function checkMapping(actor,source) {
    const [mapping]=await db.select().from(aliases).where(and(eq(aliases.sourceId,source.id),eq(aliases.orgId,actor.orgId),eq(aliases.alias,glowCentre)));
    if(!actor.centres.some(centre=>centre.id===mapping?.centreId&&isGlowHubCentre(centre))) {
      throw new RequestError(409,'Map GlowBBDashboard to the active GLOW Bukit Batok centre before continuing.');
    }
  }
  async function sourceAction(source,work) {
    try {return await work();}
    catch(error) {
      if(!(error instanceof SourceError)) throw error;
      await db.insert(integrationIssues).values({sourceId:source.id,code:error.code,detail:error.message});
      throw new RequestError(502,error.message);
    }
  }
  router.get('/admin/sources',async(req,res)=>{
    let authorised=true;
    try {requireIntegrationAccess(req,env);} catch {authorised=false;}
    const configured=authorised?await db.select().from(sources).where(eq(sources.orgId,req.actor.orgId)):[];
    const rows=await Promise.all(sourceRegistry.map(async source=>{
      const adapter=adapters.get(source.key);
      const saved=configured.find(item=>item.key===source.key);
      let detail={};
      if(saved){
        const [mappings,jobs,definitions,periods,issues,[latest]]=await Promise.all([
          db.select().from(aliases).where(eq(aliases.sourceId,saved.id)).orderBy(aliases.alias),
          history(db,saved),catalogue(saved.id),
          db.select({from:integrationSnapshots.fromDate,to:integrationSnapshots.toDate,refreshedAt:integrationSnapshots.refreshedAt})
            .from(integrationSnapshots).where(eq(integrationSnapshots.sourceId,saved.id)).orderBy(desc(integrationSnapshots.refreshedAt)).limit(30),
          db.select().from(integrationIssues).where(eq(integrationIssues.sourceId,saved.id)).orderBy(desc(integrationIssues.createdAt)).limit(15),
          db.select({data:integrationSnapshots.data}).from(integrationSnapshots).where(eq(integrationSnapshots.sourceId,saved.id))
            .orderBy(desc(integrationSnapshots.refreshedAt)).limit(1)
        ]);
        const [attempt]=jobs;
        const lastSuccess=periods[0]?.refreshedAt??null;
        detail={enabled:saved.enabled,aliases:mappings,history:jobs,definitions,periods,issues,lastSuccess,publishedMetrics:releasedMetrics(latest?.data),
          lastAttempt:attempt?.startedAt,counts:attempt?.counts,connection:definitions.length?'Verified by connection test':'Not tested',
          freshness:lastSuccess?(!saved.enabled||Date.now()-+lastSuccess>86400000||attempt?.status==='failed')?'Stale':'Current':'Unavailable'};
      }
      return {...source,configured:adapter.configured,status:!adapter.configured?(source.key===glowSource?'Not configured':'Awaiting adapter'):
        !authorised?'Operator access required':saved?.enabled?(detail.lastSuccess?'Synchronised':'Enabled'):'Disabled',
        ...(source.key===glowSource?{tabs:glowTabs}:{}),onboarding:adapter.onboarding,...detail};
    }));
    res.json({authorised,sources:rows});
  });
  router.patch('/admin/sources/:key',async(req,res)=>{
    const {enabled}=z.object({enabled:z.boolean()}).strict().parse(req.body);
    const adapter=known(req.params.key);
    if(enabled&&!adapter.configured) throw new RequestError(409,'Configure the source on the server first.');
    const source=await sourceFor(req.actor,req.params.key,true);
    await db.transaction(async tx=>{
      await tx.update(sources).set({enabled,updatedAt:new Date()}).where(eq(sources.id,source.id));
      if(!enabled) await tx.update(syncJobs).set({status:'failed',state:null,finishedAt:new Date(),leaseUntil:null,errorSummary:'Source disabled.'})
        .where(and(eq(syncJobs.sourceId,source.id),eq(syncJobs.status,'running')));
      await log(tx,req.actor,enabled?'integration.enabled':'integration.disabled',source.id);
    });
    res.json({enabled});
  });
  router.post(sourcePath+'/test',async(req,res)=>{
    const source=await sourceFor(req.actor,glowSource,true);
    await sourceAction(source,async()=>{
      await glow.test();
      const datasets=await glow.datasets();
      if(!datasets.length) throw new SourceError('NO_DATASETS','The source has not advertised datasets.');
      const definition={datasets};
      await db.insert(integrationDatasets).values({sourceId:source.id,key:'__catalogue',definition})
        .onConflictDoUpdate({target:[integrationDatasets.sourceId,integrationDatasets.key],set:{definition,updatedAt:new Date()}});
      res.json({connection:'Connected',datasets});
    });
  });
  router.post(sourcePath+'/preview',async(req,res)=>{
    const source=await sourceFor(req.actor,glowSource);
    await checkMapping(req.actor,source);
    const scope=validateDates(scopeInput.parse(req.body));
    const plan=glow.plan(await catalogue(source.id),scope);
    const stage=plan.find(item=>item.key==='summary')??plan[0];
    if(!stage) throw new RequestError(409,'Test the connection to discover approved metrics first.');
    await sourceAction(source,async()=>{
      const result=await glow.get(stage,scope);
      res.json({dataset:stage.key,metadata:result.data.data[0],rows:result.data.data.slice(1,6)});
    });
  });
  router.post([sourcePath+'/sync',sourcePath+'/historical','/admin/sources/sync-all'],async(req,res)=>{
    if(!glow.configured) throw new RequestError(409,'GlowBBDashboard is not configured.');
    const source=await sourceFor(req.actor,glowSource);
    await checkMapping(req.actor,source);
    const discovered=await catalogue(source.id);
    if(!discovered.length) throw new RequestError(409,'Test the connection first.');
    await sourceAction(source,async()=>{
      const historical=req.path.endsWith('/historical');
      const scope=validateDates(historical?historicalScope(discovered):scopeInput.parse(req.body));
      const queue=[];
      if(historical){
        const configured=await db.select().from(periods).where(eq(periods.orgId,req.actor.orgId)).orderBy(desc(periods.end));
        const seen=new Set([scope.from+'|'+scope.to]);
        for(const period of configured){
          const range={centreId:glowCentre,from:period.start,to:period.end>singaporeToday()?singaporeToday():period.end};
          const key=range.from+'|'+range.to;
          if(range.from<scope.from||range.to>scope.to||range.to<range.from||seen.has(key))continue;
          seen.add(key);
          queue.push({scope:range,stages:glow.plan(discovered,range)});
        }
      }
      const stages=glow.plan(discovered,scope);
      if(!stages.length) throw new RequestError(409,'No approved reported metrics are available.');
      res.json(publicJob(await startSync(db,req.actor,source,scope,stages,queue)));
    });
  });
  router.post(sourcePath+'/sync/:id/advance',async(req,res)=>{
    const source=await sourceFor(req.actor,glowSource);
    res.json(publicJob(await advanceSync(db,req.actor,source,glow,uid.parse(req.params.id))));
  });
  router.post('/admin/sources/:key/aliases',async(req,res)=>{
    const {alias,centreId}=z.object({alias:short,centreId:uid}).strict().parse(req.body);
    const centre=req.actor.centres.find(item=>item.id===centreId&&item.active);
    requireAccess(!!centre);
    if(req.params.key===glowSource&&(alias!==glowCentre||!isGlowHubCentre(centre))) {
      throw new RequestError(400,'Use glow_bukit_batok and a Hub centre with code GLOW_BB or GLOW_BUKIT_BATOK.');
    }
    const source=await sourceFor(req.actor,req.params.key,true);
    const record=await db.transaction(async tx=>{
      const [row]=await tx.insert(aliases).values({orgId:req.actor.orgId,sourceId:source.id,centreId,alias}).returning();
      await log(tx,req.actor,'centre_alias.created',row.id);
      return row;
    });
    res.status(201).json(record);
  });
  router.post('/admin/sources/aliases/:id/remove',async(req,res)=>{
    const id=uid.parse(req.params.id);
    await db.transaction(async tx=>{
      const [existing]=await tx.select({alias:aliases,sourceKey:sources.key}).from(aliases)
        .innerJoin(sources,eq(sources.id,aliases.sourceId)).where(and(eq(aliases.orgId,req.actor.orgId),eq(aliases.id,id))).for('update');
      if(!existing||!adapters.has(existing.sourceKey)||!req.actor.centres.some(centre=>centre.id===existing.alias.centreId)) {
        throw new RequestError(404,'Alias was not found.');
      }
      await tx.delete(aliases).where(eq(aliases.id,id));
      await log(tx,req.actor,'centre_alias.removed',id);
    });
    res.json({removed:true});
  });
  return router;
}
