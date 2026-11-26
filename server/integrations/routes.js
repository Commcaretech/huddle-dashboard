import { Router } from 'express';
import { and,desc,eq,inArray } from 'drizzle-orm';
import { z } from 'zod';
import { aliases,integrationDatasets,integrationFlags,integrationIssues,integrationSnapshots,sources,syncJobs } from '../db/schema.js';
import { requireAccess,RequestError,log } from '../report-routes.js';
import { selection,short,uid } from '../validation-hub.js';
import { sourceRegistry } from './contracts.js';
import { externalCentre,programmeId,SourceError } from './activityhub.js';
import { requireIntegrationAccess } from './access.js';
import { integrationAdapters } from './registry.js';
import { advanceSync,getSource,history,publicJob,startSync } from './sync.js';
import { connectedTabs,integratedReport } from './reporting.js';

const scopeInput=z.object({centreId:externalCentre,from:z.iso.date(),to:z.iso.date()}).strict().refine(scope=>{
  const days=(Date.parse(scope.to)-Date.parse(scope.from))/86400000;
  return days>=1&&days<=366;
},'Use an inclusive start and exclusive end, 1 to 366 days apart.');

export function integrationRoutes(db, config) {
  const router=Router();
  const env=config.integrationEnv??process.env;
  const adapters=integrationAdapters(env,config.integrationFetch);
  const activity=adapters.get('activityhub');
  router.get('/integrations/report/:tab',async(req,res)=>{
    requireIntegrationAccess(req,env);
    const query=selection.required({periodId:true}).parse(req.query);
    requireAccess(!query.centreId||req.actor.centres.some(centre=>centre.id===query.centreId));
    return res.json(await integratedReport(db,req.actor,{...query,tab:req.params.tab}));
  });
  router.use('/admin/sources',(req,_res,next)=>{
    requireAccess(req.actor.role==='hq_admin');
    // The login-free workspace uses a shared actor. A separate key protects this section.
    if (req.method!=='GET'||req.path!=='/') requireIntegrationAccess(req,env);
    next();
  });
  router.get('/admin/sources',async(req,res)=>{
    let authorised=true;
    try { requireIntegrationAccess(req,env); } catch { authorised=false; }
    const configured=authorised?await db.select().from(sources).where(eq(sources.orgId,req.actor.orgId)):[];
    const rows=await Promise.all(sourceRegistry.map(async source=>{
      const adapter=adapters.get(source.key);
      const saved=configured.find(item=>item.key===source.key);
      let detail={};
      if (saved) {
        const [mappings,jobs,datasets,periods,issues]=await Promise.all([
          db.select().from(aliases).where(eq(aliases.sourceId,saved.id)).orderBy(aliases.alias),
          history(db,saved),
          db.select().from(integrationDatasets).where(eq(integrationDatasets.sourceId,saved.id)),
          db.select({from:integrationSnapshots.fromDate,to:integrationSnapshots.toDate,externalCentre:integrationSnapshots.externalCentre,
            refreshedAt:integrationSnapshots.refreshedAt}).from(integrationSnapshots).where(eq(integrationSnapshots.sourceId,saved.id))
            .orderBy(desc(integrationSnapshots.refreshedAt)).limit(30),
          db.select().from(integrationIssues).where(eq(integrationIssues.sourceId,saved.id)).orderBy(desc(integrationIssues.createdAt)).limit(15)
        ]);
        const [attempt]=jobs;
        const lastSuccess=periods[0]?.refreshedAt??null;
        detail={enabled:saved.enabled,aliases:mappings,history:jobs,definitions:datasets.map(item=>item.definition),periods,issues,
          lastSuccess,lastAttempt:attempt?.startedAt,counts:attempt?.counts,
          connection:datasets.length?'Verified by connection test':'Not tested',
          freshness:lastSuccess ? (!saved.enabled || Date.now()-+lastSuccess>86400000 || attempt?.status==='failed')?'Stale':'Current':'Unavailable'};
      }
      return {...source,configured:adapter.configured,status:!adapter.configured?(source.key==='activityhub'?'Not configured':'Awaiting adapter'):
        !authorised?'Operator access required':saved?.enabled?(detail.lastSuccess?'Synchronised':'Ready for connection test'):'Disabled',
        ...(source.key==='activityhub'?{tabs:connectedTabs}:{}),onboarding:adapter.onboarding,...detail};
    }));
    res.json({authorised,sources:rows});
  });
  function known(key) {
    const adapter=adapters.get(key);
    if (!adapter) throw new RequestError(404,'Source was not found.');
    return adapter;
  }
  async function sourceFor(req,key,create=false) {
    const actor=req.actor;
    known(key);
    if (create) await db.insert(sources).values({orgId:actor.orgId,key}).onConflictDoNothing();
    const source=await getSource(db,actor,key);
    if (!source) throw new RequestError(409,'Configure the source first.');
    return source;
  }
  router.patch('/admin/sources/:key',async(req,res)=>{
    const {enabled}=z.object({enabled:z.boolean()}).strict().parse(req.body);
    const adapter=known(req.params.key);
    if (enabled && !adapter.configured) throw new RequestError(409,'Configure the source on the server first.');
    const source=await sourceFor(req,req.params.key,true);
    await db.transaction(async tx=>{
      await tx.update(sources).set({enabled,updatedAt:new Date()}).where(eq(sources.id,source.id));
      if (!enabled) await tx.update(syncJobs).set({status:'failed',state:null,finishedAt:new Date(),leaseUntil:null,
        errorSummary:'The source was disabled while this job was pending.'})
        .where(and(eq(syncJobs.sourceId,source.id),eq(syncJobs.status,'running')));
      await log(tx,req.actor,enabled?'integration.enabled':'integration.disabled',source.id);
    });
    res.json({enabled});
  });
  router.post('/admin/sources/activityhub/test',async(req,res)=>{
    const source=await sourceFor(req,'activityhub',true);
    try {
      await activity.test();
      const [{data:centres},{data:datasets}]=await Promise.all([activity.centres(),activity.datasets()]);
      await db.transaction(async tx=>{
        for (const definition of datasets.data) await tx.insert(integrationDatasets).values({sourceId:source.id,key:definition.id,definition})
          .onConflictDoUpdate({target:[integrationDatasets.sourceId,integrationDatasets.key],set:{definition,updatedAt:new Date()}});
      });
      res.json({connection:'Connected',centres:centres.data,datasets:datasets.data,unavailable:datasets.unavailableFields});
    } catch(error) {
      if (!(error instanceof SourceError)) throw error;
      await db.insert(integrationIssues).values({sourceId:source.id,code:error.code,detail:error.message});
      throw new RequestError(502,error.message);
    }
  });
  router.post('/admin/sources/activityhub/preview',async(req,res)=>{
    const scope=scopeInput.parse(req.body);
    const source=await sourceFor(req,'activityhub',true);
    const [mapping]=await db.select().from(aliases).where(and(eq(aliases.sourceId,source.id),eq(aliases.alias,scope.centreId)));
    requireAccess(req.actor.centres.some(centre=>centre.id===mapping?.centreId&&centre.active));
    try {
      const [{data},flags]=await Promise.all([
        activity.get('sessions',scope,{limit:8}),
        db.select().from(integrationFlags).where(and(eq(integrationFlags.sourceId,source.id),eq(integrationFlags.externalCentre,scope.centreId)))
      ]);
      res.json({...data,data:data.data.map(row=>{
        const flag=flags.find(item=>item.externalId===row.programmeId);
        return {...row,hart:!!flag?.hart,highlight:!!flag?.highlight};
      })});
    }
    catch(error) { if (!(error instanceof SourceError)) throw error; throw new RequestError(502,error.message); }
  });
  router.post(['/admin/sources/activityhub/sync','/admin/sources/sync-all'],async(req,res)=>{
    const scope=scopeInput.parse(req.body);
    if (!activity.configured) throw new RequestError(409,'ActivityHub is not configured.');
    const source=await sourceFor(req,'activityhub');
    res.json(publicJob(await startSync(db,req.actor,source,scope)));
  });
  router.post('/admin/sources/activityhub/sync/:id/advance',async(req,res)=>{
    const id=uid.parse(req.params.id);
    const source=await sourceFor(req,'activityhub');
    res.json(publicJob(await advanceSync(db,req.actor,source,activity,id)));
  });
  router.post('/admin/sources/:key/aliases',async(req,res)=>{
    const {alias,centreId}=z.object({alias:short,centreId:uid}).strict().parse(req.body);
    const actor=req.actor;
    requireAccess(actor.centres.some(centre=>centre.id===centreId&&centre.active));
    if (req.params.key==='activityhub') externalCentre.parse(alias);
    const source=await sourceFor(req,req.params.key,true);
    const record=await db.transaction(async tx=>{
      await tx.select({id:sources.id}).from(sources).where(eq(sources.id,source.id)).for('update');
      if (source.key==='activityhub') {
        const [existing]=await tx.select().from(aliases).where(and(eq(aliases.sourceId,source.id),eq(aliases.centreId,centreId),
          inArray(aliases.alias,externalCentre.options)));
        if (existing) throw new RequestError(409,'This hub centre already has an ActivityHub centre code.');
      }
      const [row]=await tx.insert(aliases).values({orgId:actor.orgId,sourceId:source.id,centreId,alias}).returning();
      await log(tx,actor,'centre_alias.created',row.id);
      return row;
    });
    res.status(201).json(record);
  });
  router.post('/admin/sources/aliases/:id/remove',async(req,res)=>{
    const id=uid.parse(req.params.id);
    await db.transaction(async tx=>{
      const [row]=await tx.delete(aliases).where(and(eq(aliases.orgId,req.actor.orgId),eq(aliases.id,id))).returning();
      if (!row||!req.actor.centres.some(centre=>centre.id===row.centreId)) throw new RequestError(404,'Alias was not found.');
      await log(tx,req.actor,'centre_alias.removed',id);
    });
    res.json({removed:true});
  });
  router.put('/admin/sources/activityhub/programme-flags',async(req,res)=>{
    const {externalCentre:code,externalId,hart,highlight}=z.object({
      externalCentre,externalId:programmeId,hart:z.boolean(),highlight:z.boolean()
    }).strict().parse(req.body);
    const source=await sourceFor(req,'activityhub');
    const [mapping]=await db.select().from(aliases).where(and(eq(aliases.sourceId,source.id),eq(aliases.alias,code)));
    requireAccess(req.actor.centres.some(centre=>centre.id===mapping?.centreId&&centre.active));
    await db.insert(integrationFlags).values({sourceId:source.id,externalCentre:code,externalId,hart,highlight})
      .onConflictDoUpdate({target:[integrationFlags.sourceId,integrationFlags.externalCentre,integrationFlags.externalId],
        set:{hart,highlight,updatedAt:new Date()}});
    res.json({saved:true});
  });
  return router;
}
