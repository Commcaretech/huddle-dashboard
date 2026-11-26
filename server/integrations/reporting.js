import { and,desc,eq } from 'drizzle-orm';
import { aliases,integrationSnapshots,periods,syncJobs } from '../db/schema.js';
import { singaporeToday } from '../../shared/reporting.js';
import { RequestError } from '../report-routes.js';
import { getSource } from './sync.js';
import { glowCentre,glowSource,glowTabs } from './glowbb-metrics.js';

export function isGlowHubCentre(centre) {
  return centre?.active && ['GLOW_BB','GLOW_BUKIT_BATOK'].includes(centre.code.toUpperCase());
}

function reportRows(rows){
  return rows.slice(0,150).map(row=>row.programme&&row.monthly ? {...row,
    monthly:row.monthly.slice(-12).map(month=>({month:month.month,metrics:{attendance:month.metrics.attendance,unique:month.metrics.unique}}))
  }:row);
}

const forTab={
  'kpi-performance':['summary','summary:year-ago','summary:ytd','summary:ytd-ago','kpis','trends:month','trends:quarter','trends:year','health-assessments'],
  'participant-profiles':['membership','attendance','demographics','programmes','trends:month','trends:quarter','trends:year'],
  'health-data':['health-assessments'],
  fitness:['fitness','fitness:gym-tonic'],
  hart:['hart']
};

export async function integratedReport(db,actor,{tab,periodId,centreId,approvedHart=new Set()}) {
  if (!glowTabs.includes(tab)) throw new RequestError(404,'Reporting dataset not found.');
  const [period]=await db.select().from(periods).where(and(eq(periods.orgId,actor.orgId),eq(periods.id,periodId)));
  if (!period) throw new RequestError(404,'Reporting period not found.');
  const today=singaporeToday();
  const window={start:period.start,end:period.end>today?today:period.end};
  const base={source:'GlowBBDashboard',centreName:'GLOW Bukit Batok',window,partial:!centreId,datasets:[]};
  const unavailable=reason=>({...base,reason});
  if(window.end<window.start) return unavailable('The selected reporting period has not started.');
  const source=await getSource(db,actor,glowSource);
  if (!source) return unavailable('GlowBBDashboard has not been configured.');
  const [mapping]=await db.select().from(aliases).where(and(eq(aliases.orgId,actor.orgId),eq(aliases.sourceId,source.id),eq(aliases.alias,glowCentre)));
  const mapped=actor.centres.find(centre=>centre.id===mapping?.centreId&&isGlowHubCentre(centre));
  if(!mapped || (centreId&&mapped.id!==centreId)) return unavailable('GlowBBDashboard data is available only for its mapped GLOW Bukit Batok centre.');
  const [snapshot]=await db.select().from(integrationSnapshots).where(and(
    eq(integrationSnapshots.orgId,actor.orgId),eq(integrationSnapshots.sourceId,source.id),eq(integrationSnapshots.externalCentre,glowCentre),
    eq(integrationSnapshots.centreId,mapped.id),eq(integrationSnapshots.fromDate,window.start),eq(integrationSnapshots.toDate,window.end)
  ));
  if(!snapshot) return unavailable('No published snapshot matches these exact dates. Sync this range in Data sources.');
  const [attempt]=await db.select({status:syncJobs.status,createdAt:syncJobs.createdAt}).from(syncJobs)
    .where(eq(syncJobs.sourceId,source.id)).orderBy(desc(syncJobs.createdAt)).limit(1);
  const datasets=forTab[tab].flatMap(key=>{
    const [meta,...rows]=snapshot.data[key]?.rows??[];
    if(!meta) return [];
    return [{key,meta,rows:reportRows(rows),truncated:rows.length>150,definitions:meta.definitions??[]}];
  });
  if(tab==='hart'&&approvedHart.size){
    const [meta,...rows]=snapshot.data.programmes?.rows??[];
    if(meta){
      const approvedRows=rows.filter(row=>approvedHart.has(row.programme));
      if(approvedRows.length) {
        const {metrics,previous,...programmeMeta}=meta;
        datasets.push({key:'hart:approved-programmes',meta:programmeMeta,rows:reportRows(approvedRows),
          truncated:approvedRows.length>150,definitions:meta.definitions??[]});
      }
    }
  }
  return {...base,datasets,syncedAt:snapshot.refreshedAt,disabled:!source.enabled,
    stale:!source.enabled||Date.now()-+snapshot.refreshedAt>86400000||(attempt?.status==='failed'&&attempt.createdAt>snapshot.refreshedAt),
    reason:datasets.length?null:'The source did not advertise a dataset for this reporting tab.'};
}
