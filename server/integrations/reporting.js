import { and,desc,eq,gte,inArray,lte,ne } from 'drizzle-orm';
import { aliases, integrationFlags, integrationSnapshots, periods, syncJobs } from '../db/schema.js';
import { addDays,dateWindow,singaporeToday } from '../../shared/reporting.js';
import { RequestError } from '../report-routes.js';
import { getSource } from './sync.js';

export const connectedTabs=['kpi-performance','participant-profiles','fitness','hart','next-two-weeks','next-three-months'];
export const methodology={
  Programmes:'Distinct source programme IDs among matching dated sessions, including IDs with cancelled sessions.',
  Sessions:'Eligible persisted dated occurrences. Recorded source statuses are preserved.',
  Scheduled:'Occurrences with the recorded scheduled status.',
  Tentative:'Occurrences with the recorded TBC status.',
  Cancelled:'Occurrences with the recorded cancelled status.',
  'Reported completed':'Occurrences explicitly marked completed in ActivityHub. ActivityHub has no completion workflow.',
  'Planned pax':'Sum of recorded planned pax over non-cancelled sessions. Coverage is shown separately.'
};
export function calculateMetrics(rows) {
  const pax=rows.filter(row=>row.status!=='cancelled'&&row.plannedPax!==null);
  return { Programmes:new Set(rows.map(row=>row.programmeId)).size,Sessions:rows.length,
    Scheduled:rows.filter(row=>row.status==='scheduled').length,Tentative:rows.filter(row=>row.status==='tbc').length,
    Cancelled:rows.filter(row=>row.status==='cancelled').length,
    'Reported completed':rows.some(row=>row.status==='completed')?rows.filter(row=>row.status==='completed').length:null,
    'Planned pax':pax.length?pax.reduce((sum,row)=>sum+row.plannedPax,0):null,paxSessions:pax.length };
}
export async function integratedReport(db,actor,{tab,periodId,centreId}) {
  if (!connectedTabs.includes(tab)) throw new RequestError(404,'Reporting dataset not found.');
  const [period]=await db.select().from(periods).where(and(eq(periods.orgId,actor.orgId),eq(periods.id,periodId)));
  if (!period) throw new RequestError(404,'Reporting period not found.');
  const window=dateWindow(tab,period);
  const source=await getSource(db,actor,'activityhub');
  const result={window,source:'ActivityHub',methodology,coverage:[],metrics:null,programmes:[],sessions:[],truncated:false};
  if (!source) return result;
  const centreIds=new Set(actor.centres.filter(centre=>centre.active&&(!centreId||centre.id===centreId)).map(centre=>centre.id));
  if (!centreIds.size) return result;
  const [rows,flags,[recentAttempt]]=await Promise.all([
    db.selectDistinctOn([integrationSnapshots.centreId],{snapshot:integrationSnapshots}).from(integrationSnapshots)
      .innerJoin(aliases,and(eq(aliases.sourceId,integrationSnapshots.sourceId),
        eq(aliases.orgId,integrationSnapshots.orgId),eq(aliases.alias,integrationSnapshots.externalCentre),
        eq(aliases.centreId,integrationSnapshots.centreId)))
      .where(and(eq(integrationSnapshots.orgId,actor.orgId),eq(integrationSnapshots.sourceId,source.id),
        inArray(integrationSnapshots.centreId,[...centreIds]),lte(integrationSnapshots.fromDate,window.start),
        gte(integrationSnapshots.toDate,addDays(window.end,1))))
      .orderBy(integrationSnapshots.centreId,desc(integrationSnapshots.refreshedAt),integrationSnapshots.id),
    db.select().from(integrationFlags).where(eq(integrationFlags.sourceId,source.id)),
    db.select().from(syncJobs).where(and(eq(syncJobs.sourceId,source.id),ne(syncJobs.status,'running'))).orderBy(desc(syncJobs.createdAt)).limit(1)
  ]);
  const selected=rows.map(row=>row.snapshot);
  const flagsById=new Map(flags.map(flag=>[flag.externalCentre+':'+flag.externalId,flag]));
  const missingHartApproval=tab==='hart'&&selected.length>0&&
    !flags.some(flag=>flag.hart&&selected.some(snapshot=>snapshot.externalCentre===flag.externalCentre));
  const upcoming=tab.startsWith('next-');
  const now=new Date();
  const today=singaporeToday(now);
  const clock=now.toLocaleTimeString('en-GB',{timeZone:'Asia/Singapore',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const sessions=selected.flatMap(snapshot=>(snapshot.data[upcoming?'upcoming':'sessions']?.rows??[]).filter(row=>{
    if (row.sessionDate<window.start||row.sessionDate>window.end) return false;
    const flag=flagsById.get(row.centreId+':'+row.programmeId);
    if (tab==='fitness'&&!row.fitnessRelated) return false;
    if (tab==='hart'&&!flag?.hart) return false;
    if (tab==='next-two-weeks'&&!flag?.highlight) return false;
    if (upcoming&&(row.sessionDate<today||(row.sessionDate===today&&(!row.startTime||row.startTime.padStart(5,'0')<=clock)))) return false;
    return true;
  }).map(row=>({...row,hubCentreId:snapshot.centreId})));
  const ids=new Set(sessions.map(row=>row.programmeId));
  const programmes=selected.flatMap(snapshot=>snapshot.data.programmes?.rows??[]).filter(row=>ids.has(row.id)).map(row=>({
    ...row,...flagsById.get(row.centreId+':'+row.id)
  }));
  return {...result,disabled:!source.enabled,partial:selected.length<centreIds.size,
    coverage:selected.map(row=>({centreId:row.centreId,syncedAt:row.refreshedAt,
      stale:!source.enabled||+now-+row.refreshedAt>86400000||
        (recentAttempt?.status==='failed'&&recentAttempt.createdAt>row.refreshedAt)})),
    metrics:selected.length&&!missingHartApproval?calculateMetrics(sessions):null,
    unavailableReason:missingHartApproval?'No approved H.ART programme mapping for the covered centres.':null,programmes:programmes.slice(0,100),
    sessions:sessions.sort((a,b)=>a.sessionDate.localeCompare(b.sessionDate)||String(a.startTime).localeCompare(String(b.startTime))).slice(0,100),
    truncated:programmes.length>100||sessions.length>100 };
}
