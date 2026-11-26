import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { aliases, centres, integrationIssues, integrationSnapshots, sources, syncJobs } from '../db/schema.js';
import { RequestError } from '../report-routes.js';
import { SourceError } from './source-error.js';

const maxRows=3000;
const pendingWindow=60*60*1000;
const zero={retrieved:0,inserted:0,updated:0,rejected:0,removed:0};

export const sourceScope=(actor,key)=>and(eq(sources.orgId,actor.orgId),eq(sources.key,key));
export async function getSource(db,actor,key) {
  const [source]=await db.select().from(sources).where(sourceScope(actor,key));
  return source;
}
function snapshotScope(source,scope) {
  return and(eq(integrationSnapshots.orgId,source.orgId),eq(integrationSnapshots.sourceId,source.id),
    eq(integrationSnapshots.externalCentre,scope.centreId),eq(integrationSnapshots.fromDate,scope.from),eq(integrationSnapshots.toDate,scope.to));
}
async function mappedCentre(db,actor,source,external) {
  const [row]=await db.select({centreId:aliases.centreId}).from(aliases)
    .innerJoin(centres,and(eq(centres.id,aliases.centreId),eq(centres.orgId,aliases.orgId)))
    .where(and(eq(aliases.sourceId,source.id),eq(aliases.orgId,actor.orgId),eq(aliases.alias,external),eq(centres.active,true)));
  return actor.centres.some(centre=>centre.id===row?.centreId&&centre.active)?row.centreId:null;
}
export async function startSync(db,actor,source,scope,stages,queue=[]) {
  const centreId=await mappedCentre(db,actor,source,scope.centreId);
  if (!centreId) {
    await db.insert(integrationIssues).values({sourceId:source.id,code:'UNMAPPED_CENTRE',detail:'No active exact mapping for '+scope.centreId+'.'});
    throw new RequestError(409,'Map '+scope.centreId+' to an active hub centre before syncing.');
  }
  return db.transaction(async tx=>{
    const [current]=await tx.select().from(sources).where(eq(sources.id,source.id)).for('update');
    if (!current?.enabled) throw new RequestError(409,'Enable the source before synchronising.');
    const now=new Date();
    await tx.update(syncJobs).set({
      status:'failed',state:null,leaseUntil:null,finishedAt:now,errorSummary:'Unfinished sync expired.'
    }).where(and(eq(syncJobs.sourceId,source.id),eq(syncJobs.status,'running'),lt(syncJobs.createdAt,new Date(+now-pendingWindow))));
    const [running]=await tx.select().from(syncJobs).where(and(eq(syncJobs.sourceId,source.id),eq(syncJobs.status,'running')));
    if (running) {
      if (Object.keys(scope).some(key=>running.state.scope[key]!==scope[key])) throw new RequestError(409,'A sync is pending for another scope. Resume that scope first.');
      return running;
    }
    const [job]=await tx.insert(syncJobs).values({sourceId:source.id,status:'running',counts:zero,state:{
      scope,centreId,stages,queue,step:0,datasets:{},retrieved:0
    }}).returning();
    return job;
  });
}
export function publicJob(job) {
  return {id:job.id,status:job.status,counts:job.counts,error:job.errorSummary,
    startedAt:job.createdAt,finishedAt:job.finishedAt,progress:job.state ? {
      dataset:job.state.stages?.[job.state.step]?.key,scope:job.state.scope,retrieved:job.state.retrieved,remainingScopes:job.state.queue?.length??0
    } : null};
}
function recordKey(row) { return row.id??row.centreId; }
function compare(previous,next) {
  const counts={...zero};
  for (const stage of new Set([...Object.keys(previous??{}),...Object.keys(next)])) {
    const old=new Map((previous?.[stage]?.rows??[]).map(row=>[recordKey(row),row]));
    for (const row of next[stage]?.rows??[]) {
      const id=recordKey(row);
      if (!old.has(id)) counts.inserted++;
      else if (!isDeepStrictEqual(old.get(id),row)) counts.updated++;
      old.delete(id);
    }
    counts.removed+=old.size;
  }
  return counts;
}
export async function advanceSync(db,actor,source,adapter,id) {
  const token=randomUUID();
  const now=new Date();
  const where=and(eq(syncJobs.id,id),eq(syncJobs.sourceId,source.id));
  const [job]=await db.transaction(async tx=>{
    const [current]=await tx.select().from(syncJobs).where(where).for('update');
    if (!current) throw new RequestError(404,'Sync job not found.');
    if (current.status!=='running') return [current];
    if (current.leaseUntil && current.leaseUntil>now) throw new RequestError(409,'This sync batch is already running.');
    const state={...current.state,token};
    return tx.update(syncJobs).set({leaseUntil:new Date(+now+45000),state}).where(where).returning();
  });
  if (job.status!=='running') return job;
  const state=job.state;
  const stage=state.stages[state.step];
  const key=stage.key;
  const scope=state.scope;
  const owned=and(where,eq(syncJobs.status,'running'),sql`${syncJobs.state}->>'token' = ${token}`);
  let fetchedRows=0;
  try {
    const [previous]=await db.select().from(integrationSnapshots).where(snapshotScope(source,scope));
    const old=previous?.data?.[key];
    const partial=state.datasets[key];
    const result=await adapter.get(stage,scope,{cursor:partial?.cursor,etag:!partial?old?.etag:undefined});
    if (result.unchanged) {
      if (!old) throw new SourceError('INVALID_RESPONSE','No previous complete dataset is available.');
      state.datasets[key]=old;
      state.step++;
    } else {
      const page=result.data;
      fetchedRows=page.data.length;
      if (page.totalCount>maxRows) throw new SourceError('SCOPE_TOO_LARGE','This scope has more than 3,000 rows in one dataset. Use a shorter range.');
      if (partial && (partial.snapshot!==page.snapshot || partial.total!==page.totalCount)) {
        throw new SourceError('SNAPSHOT_CHANGED_RESTART','Snapshot changed between pages. Start a new sync.');
      }
      const rows=[...(partial?.rows??[]),...page.data];
      const unique=new Set(rows.map(recordKey));
      const cursor=page.page.nextCursor;
      if (unique.size!==rows.length || rows.length>page.totalCount ||
        (cursor && (cursor===partial?.cursor || !page.data.length || rows.length===page.totalCount)) ||
        (!cursor && rows.length!==page.totalCount)) {
        throw new SourceError('INVALID_PAGE','Unexpected duplicate, count or cursor in the source snapshot.');
      }
      state.retrieved+=fetchedRows;
      fetchedRows=0;
      state.datasets[key]={rows,cursor,total:page.totalCount,snapshot:page.snapshot,etag:partial?.etag??result.etag};
      if (!cursor) state.step++;
    }
    if (Buffer.byteLength(JSON.stringify(state.datasets))>10_000_000) throw new SourceError('SCOPE_TOO_LARGE','This scope exceeds the snapshot storage budget. Use shorter date ranges.');
    return await db.transaction(async tx=>{
      const [latest]=await tx.select().from(sources).where(eq(sources.id,source.id)).for('update');
      const [active]=await tx.select().from(syncJobs).where(owned).for('update');
      if (!active) throw new RequestError(409,'Sync lease was lost. Refresh the job history.');
      if (!latest?.enabled || await mappedCentre(tx,actor,source,scope.centreId)!==state.centreId) {
        throw new SourceError('MAPPING_CHANGED','Source or centre mapping changed during synchronisation.');
      }
      let update={state,leaseUntil:null,counts:{...job.counts,retrieved:state.retrieved}};
      if (state.step===state.stages.length) {
        const saved={orgId:actor.orgId,sourceId:source.id,centreId:state.centreId,externalCentre:scope.centreId,
          fromDate:scope.from,toDate:scope.to,data:state.datasets,refreshedAt:new Date()};
        await tx.insert(integrationSnapshots).values(saved).onConflictDoUpdate({
          target:[integrationSnapshots.sourceId,integrationSnapshots.externalCentre,integrationSnapshots.fromDate,integrationSnapshots.toDate],
          set:{centreId:saved.centreId,data:saved.data,refreshedAt:saved.refreshedAt}
        });
        const scopeCounts=compare(previous?.data,state.datasets);
        const counts={...job.counts,retrieved:state.retrieved};
        for(const field of ['inserted','updated','removed']) counts[field]=(counts[field]??0)+scopeCounts[field];
        const [next,...queue]=state.queue??[];
        update=next?{state:{...state,...next,queue,step:0,datasets:{}},leaseUntil:null,counts}:
          {status:'published',state:null,leaseUntil:null,finishedAt:new Date(),counts};
      }
      const [finished]=await tx.update(syncJobs).set(update).where(owned).returning();
      return finished;
    });
  } catch (error) {
    if (error instanceof RequestError) throw error;
    const safe=error instanceof SourceError ? error : new SourceError('SYNC_FAILED','The reporting snapshot could not be saved.');
    return db.transaction(async tx=>{
      const [failed]=await tx.update(syncJobs).set({status:'failed',state:null,leaseUntil:null,finishedAt:new Date(),
        errorSummary:safe.message,counts:{...job.counts,retrieved:state.retrieved+fetchedRows,rejected:safe.code==='INVALID_RESPONSE'?Math.max(1,fetchedRows):fetchedRows}
      }).where(owned).returning();
      if (!failed) throw new RequestError(409,'Sync lease was lost. Refresh the job history.');
      await tx.insert(integrationIssues).values({sourceId:source.id,jobId:id,code:safe.code,detail:safe.message});
      return failed;
    });
  }
}
export async function history(db,source) {
  return (await db.select().from(syncJobs).where(eq(syncJobs.sourceId,source.id))
    .orderBy(desc(syncJobs.createdAt)).limit(30)).map(publicJob);
}
