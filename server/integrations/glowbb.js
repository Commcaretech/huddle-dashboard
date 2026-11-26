import { createHash } from 'node:crypto';
import { z } from 'zod';
import { singaporeToday } from '../../shared/reporting.js';
import { approvedMetrics,distributions,glowCentre,glowRoutes,glowSource } from './glowbb-metrics.js';
import { SourceError } from './source-error.js';

const label=z.string().min(1).max(400);
const id=z.string().min(1).max(200);
const date=z.iso.date();
const timestamp=z.iso.datetime({offset:true});
const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const dates=z.object({from:date,to:date}).refine(r=>r.from<=r.to);
const range=z.object({from:date.nullable(),to:date.nullable()}).nullable();
const count=z.number().int().nonnegative();
const metric=z.object({value:z.union([z.number().finite(),z.null(),z.array(z.unknown()).max(100)]),unit:label,
  status:z.enum(['available','missing','suppressed']),numerator:z.number().finite().nullable().optional(),denominator:z.number().finite().nullable().optional()});
const band=z.object({label:label,value:count});
const scoreBand=z.object({sourceDefinition:label,score:z.number().finite(),people:count});
const definition=z.object({id,displayName:label,description:z.string().max(2000),unit:label,methodology:z.string().max(2000),
  supportedFilters:z.array(label).max(30),aggregation:label,dataSource:label,
  availability:z.enum(['source_present','missing']),availableDateRange:range});
const discovery=z.array(z.object({id,supportedFilters:z.array(label).max(30),classifications:z.array(label).max(40).optional(),
  metrics:z.array(definition).max(150)})).max(30);
const envelope=z.object({sourceSystem:z.literal('GlowBBDashboard'),centreId:z.literal(glowCentre),centreName:label,
  dataset:id,schemaVersion:z.literal('1.0'),timezone:z.literal('Asia/Singapore'),period:dates.nullable(),
  availableDateRange:range.optional(),appliedFilters:z.record(z.string(),z.string()),
  coverageStatus:z.enum(['missing','partial','within_observed_range']).optional(),status:z.enum(['ready','missing']).optional(),
  dataLastUpdatedAt:timestamp.nullable(),dataRetrievedAt:timestamp});
const safeFilters=new Set(['centre','from','to','year','month','quarter','grain','subdomain','page','limit','assessmentType']);
const genericMetrics=z.record(z.string(),z.unknown());
const segment=z.object({month,metrics:genericMetrics});
const programmeRow=z.object({programme:id,name:label,rank:z.number().int().positive(),primaryDomain:label.nullable(),
  domains:z.array(label).max(12),subdomains:z.array(label).max(80),metrics:genericMetrics,previous:genericMetrics.nullable(),monthly:z.array(segment).max(121)});
const trendRow=z.object({period:z.string().regex(/^\d{4}(?:-(?:0[1-9]|1[0-2]|Q[1-4]))?$/),from:date,to:date,partial:z.boolean(),metrics:genericMetrics});
const kpiRow=z.object({metric:id,source:z.enum(['dashboard','operations']),from:date,to:date,programme:id.nullable(),metrics:genericMetrics});
const healthGroup=z.object({metrics:genericMetrics,monthly:z.array(z.object({month,reportedTotal:metric,final:z.boolean().nullable()})).max(121),
  reportedMonths:count,selectedMonths:count,linked:genericMetrics.nullable().optional(),linkedMonthly:z.array(z.object({month,records:count})).max(121).nullable().optional()});
const healthPayload=z.object({SPPB:healthGroup.optional(),TANITA:healthGroup.optional()});
const comparison=z.object({from:date,to:date,metrics:genericMetrics}).nullable();
const paged=new Set(['programmes','fitness','hart']);

function parse(schema,value) {
  const result=schema.safeParse(value);
  if (!result.success) throw new SourceError('INVALID_RESPONSE','GlowBBDashboard returned a response outside the approved contract.');
  return result.data;
}
function cleanMetric(key,value) {
  const cell=parse(metric,value);
  if (cell.status!=='available') return {...cell,value:null,numerator:null,denominator:null};
  if (Array.isArray(cell.value)) {
    if (!distributions.has(key)) throw new SourceError('INVALID_RESPONSE','Unexpected distribution for an approved scalar metric.');
    return {...cell,value:parse(z.array(key==='scoreDistribution'?scoreBand:band).max(100),cell.value)};
  }
  if (cell.value===null || distributions.has(key)) throw new SourceError('INVALID_RESPONSE','A released metric is missing its approved value.');
  return cell;
}
function metricMap(value,known) {
  return Object.fromEntries(Object.entries(parse(genericMetrics,value)).filter(([key])=>known.has(key))
    .map(([key,cell])=>[key,cleanMetric(key,cell)]));
}

export function glowConfig(env) {
  const url=URL.parse(env.GLOWBB_REPORTING_BASE_URL?.trim()||'');
  const key=env.GLOWBB_API_KEY?.trim();
  const allowedUrl=url?.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&/^\/api\/reporting\/v1\/?$/.test(url.pathname);
  if (!allowedUrl || !key || key.length<32 || key.length>512 || /[^\x21-\x7e]/.test(key)) return null;
  const extras=new Set((env.GLOWBB_APPROVED_METRICS??'').split(',').map(item=>item.trim()).filter(Boolean));
  const hartProgrammes=new Set((env.GLOWBB_APPROVED_HART_PROGRAMMES??'').split(',').map(item=>item.trim()).filter(Boolean));
  return {base:url.href.replace(/\/$/,''),key,extras,hartProgrammes};
}

async function jsonResponse(response) {
  const reader=response.body?.getReader();
  if (!reader) throw new SourceError('INVALID_RESPONSE','GlowBBDashboard returned an empty response.');
  let bytes=0,body='';
  const decoder=new TextDecoder();
  try {
    while(true) {
      const {done,value}=await reader.read();
      if(done) break;
      bytes+=value.length;
      if(bytes>2_000_000) {
        await reader.cancel();
        throw new SourceError('RESPONSE_LIMIT','The source response exceeded the page budget. Use a shorter date range.');
      }
      body+=decoder.decode(value,{stream:true});
    }
    return JSON.parse(body+decoder.decode());
  } catch(error) {
    if(error instanceof SourceError) throw error;
    throw new SourceError('INVALID_RESPONSE','GlowBBDashboard returned invalid JSON or an interrupted response.');
  } finally {reader.releaseLock();}
}
const stableKey=values=>createHash('sha256').update(JSON.stringify(values)).digest('hex');

function previousYear(value) {
  const year=String(Number(value.slice(0,4))-1).padStart(4,'0');
  const shifted=year+value.slice(4);
  return date.safeParse(shifted).success?shifted:year+'-02-28';
}

export function glowAdapter(config,fetcher=fetch) {
  async function request(route,filters={}) {
    if(!config) throw new SourceError('NOT_CONFIGURED','Set the GlowBBDashboard URL and API key on the server.');
    const target=new URL(config.base+'/'+route);
    target.searchParams.set('centre',glowCentre);
    for(const [key,value] of Object.entries(filters)) target.searchParams.set(key,String(value));
    let response;
    try {
      response=await fetcher(target,{method:'GET',headers:{Accept:'application/json',Authorization:'Bearer '+config.key},
        redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
    } catch {throw new SourceError('SOURCE_UNAVAILABLE','GlowBBDashboard did not respond within the request window.');}
    if(!response.ok) {
      await response.body?.cancel();
      const codes={401:['INVALID_CREDENTIALS','GlowBBDashboard rejected the API key.'],403:['CENTRE_NOT_ALLOWED','The source key does not allow GLOW Bukit Batok.'],
        404:['NOT_FOUND','The requested source dataset or centre is unavailable.'],429:['RATE_LIMITED','GlowBBDashboard is busy. Wait before retrying.']};
      throw new SourceError(...(codes[response.status]??['SOURCE_UNAVAILABLE','GlowBBDashboard returned HTTP '+response.status+'.']));
    }
    const payload=await jsonResponse(response);
    const header=parse(envelope,payload);
    if(header.dataset!==route || header.appliedFilters.centre!==glowCentre ||
      (filters.from && (header.period?.from!==filters.from||header.period.to!==filters.to ||
        header.appliedFilters.from!==filters.from||header.appliedFilters.to!==filters.to)) ||
      ['grain','subdomain'].some(key=>filters[key]&&header.appliedFilters[key]!==filters[key]) ||
      Object.keys(header.appliedFilters).some(key=>!safeFilters.has(key))) {
      throw new SourceError('WRONG_SCOPE','The source returned a different dataset, centre or date range.');
    }
    return {header,payload};
  }
  async function test(){
    const {payload}=await request('health');
    if(!parse(z.boolean(),payload.workspaceAvailable)) throw new SourceError('WORKSPACE_MISSING','The source has no reporting workspace for GLOW Bukit Batok.');
  }
  async function datasets(){
    const {payload}=await request('datasets');
    return parse(discovery,payload.datasets).map(dataset=>({...dataset,metrics:dataset.metrics.map(item=>({...item,
      approved:approvedMetrics[dataset.id]?.includes(item.id)||config?.extras.has(dataset.id+'.'+item.id)||false
    }))}));
  }
  function plan(catalogue,scope) {
    const enabled=new Map(catalogue.filter(item=>glowRoutes.includes(item.id)).map(item=>[item.id,item]));
    const result=[];
    function push(key,route,filters={},bounds=scope) {
      const item=enabled.get(route);
      if(!item) return;
      const definitions=item.metrics.filter(metric=>metric.approved);
      const metrics=definitions.map(metric=>metric.id);
      if(!metrics.length) return;
      result.push({key,route,filters:{...filters,from:bounds.from,to:bounds.to},metrics,definitions});
    }
    for(const route of enabled.keys()){
      if(route==='trends'){
        for(const grain of ['month','quarter','year']) push('trends:'+grain,route,{grain});
      } else push(route,route);
    }
    if(enabled.get('fitness')?.classifications?.includes('Fitness')&&enabled.get('fitness')?.classifications?.includes('Gym Tonic')) {
      push('fitness:gym-tonic','fitness',{subdomain:'Gym Tonic'});
    }
    const ytd={from:scope.to.slice(0,4)+'-01-01',to:scope.to};
    push('summary:year-ago','summary',{}, {from:previousYear(scope.from),to:previousYear(scope.to)});
    push('summary:ytd','summary',{},ytd);
    push('summary:ytd-ago','summary',{}, {from:previousYear(ytd.from),to:previousYear(ytd.to)});
    return result;
  }

  async function get(stage,_scope,{cursor}={}) {
    const {key,route,filters,metrics}=stage;
    const page=cursor?Number(cursor):1;
    const query=paged.has(route)?{...filters,page,limit:50}:filters;
    const {header,payload}=await request(route,query);
    const known=new Set(metrics.filter(item=>approvedMetrics[route]?.includes(item)||config?.extras.has(route+'.'+item)));
    const cells=input=>metricMap(input,known);
    if(header.status==='missing') throw new SourceError('WORKSPACE_MISSING','GlowBBDashboard has no active workspace for GLOW Bukit Batok. The previous snapshot is unchanged.');
    const {dataRetrievedAt,...stableHeader}=header;
    const meta={id:'metadata',...stableHeader,definitions:stage.definitions??[]};
    let rows=[];
    let total=0;
    let nextCursor=null;
    if(payload.metrics!==undefined) meta.metrics=cells(payload.metrics);
    if(payload.previous!==undefined){
      const prior=parse(comparison,payload.previous);
      if(prior) meta.previous={from:prior.from,to:prior.to,metrics:cells(prior.metrics)};
    }
    if(payload.classification!==undefined) meta.classification=parse(label,payload.classification);
    if(paged.has(route)){
      const pagination=parse(z.object({page:z.number().int().positive(),limit:z.literal(50),total:count}),payload.pagination);
      rows=parse(z.array(programmeRow).max(50),payload.rows).map(row=>({...row,id:'programme:'+row.programme,
        metrics:cells(row.metrics),previous:row.previous?cells(row.previous):null,
        monthly:row.monthly.map(item=>({...item,metrics:cells(item.metrics)}))}));
      if(pagination.page!==page || rows.some((row,index)=>row.rank!==(page-1)*50+index+1) || rows.length!==Math.max(0,Math.min(50,pagination.total-50*(page-1)))) {
        throw new SourceError('INVALID_PAGE','GlowBBDashboard pagination did not match its programme rows.');
      }
      total=pagination.total;
      if(page*50<total) nextCursor=String(page+1);
    }else if(route==='trends'){
      rows=parse(z.array(trendRow).max(121),payload.rows).map(row=>({...row,id:row.period,metrics:cells(row.metrics)}));
    }else if(route==='kpis'){
      const records=parse(z.array(kpiRow).max(1500),payload.rows);
      const unique=new Map();
      for(const row of records) {
        const record={...row,id:stableKey([row.source,row.metric,row.from,row.to,row.programme,row.metrics.target?.value]),metrics:cells(row.metrics)};
        const other=unique.get(record.id);
        if(other&&JSON.stringify(other)!==JSON.stringify(record)) throw new SourceError('DUPLICATE_TARGET','The source returned conflicting KPI records for one target.');
        unique.set(record.id,record);
      }
      rows=[...unique.values()];
    }else if(route==='health-assessments'){
      rows=Object.entries(parse(healthPayload,payload.assessments)).map(([assessment,group])=>({
        ...group,id:assessment,metrics:cells(group.metrics),linked:group.linked?cells(group.linked):undefined,
        monthly:known.has('reportedTotal')?group.monthly.map(item=>({...item,reportedTotal:cleanMetric('reportedTotal',item.reportedTotal)})):[],
        linkedMonthly:known.has('records')?group.linkedMonthly:undefined
      }));
    }
    if(!paged.has(route)) total=rows.length;
    const snapshot=stableKey([key,header.dataLastUpdatedAt,header.coverageStatus,total,meta.metrics,meta.previous,meta.classification]);
    if(page===1) rows.unshift(meta);
    return {data:{data:rows,totalCount:total+1,snapshot,page:{nextCursor}}};
  }

  return {key:glowSource,configured:!!config,test,datasets,plan,get,
    approvedHart:config?.hartProgrammes??new Set()};
}

export function historicalScope(catalogue){
  const bounds=catalogue.flatMap(dataset=>dataset.metrics.filter(metric=>metric.approved&&metric.availability==='source_present')
    .map(metric=>metric.availableDateRange)).filter(range=>range?.from&&range?.to);
  if(!bounds.length) throw new SourceError('NO_HISTORICAL_COVERAGE','The source has not advertised any approved historical coverage.');
  const from=bounds.map(item=>item.from).sort()[0];
  const to=[singaporeToday(),bounds.map(item=>item.to).sort().at(-1)].sort()[0];
  return {centreId:glowCentre,from,to};
}
