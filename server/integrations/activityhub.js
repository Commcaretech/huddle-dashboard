import { z } from 'zod';

const count = z.number().int().nonnegative();
const label = z.string().min(1).max(300);
const stamp = z.iso.datetime({ offset:true });
const domain = z.enum(['Physical','Cognitive','Social','Learning','Volunteerism']);
const status = z.enum(['scheduled','tbc','cancelled','completed']);
export const externalCentre = z.enum(['SEEN_BB','GLOW_BB','SEEN_NY','GLOW_NY']);
export const programmeId = z.string().regex(/^ah-programme-v1:[a-f0-9]{64}$/);
const time = z.string().regex(/^(?:[01]?[0-9]|2[0-3]):[0-5][0-9]$/).nullable();
const unknownProgrammeFields = {
  hartRelated:z.null(), description:z.null(), subdomain:z.null(), programmeCapacity:z.null()
};
const frequency = z.enum(['once','daily','weekly','fortnightly','monthly']);
const centre = z.object({centreId:externalCentre,name:label,brand:z.enum(['SEEN','GLOW']),location:z.enum(['Bukit Batok','Nanyang'])});
const programme = z.object({
  id:programmeId,centreId:externalCentre,name:label,kind:z.enum(['series','standalone']),domains:z.array(domain).max(5),
  frequencies:z.array(frequency).max(5),sessionCount:count,templateCount:count,updatedAt:stamp.nullable(),
  fitnessRelated:z.boolean(),...unknownProgrammeFields
});
const session = z.object({
  id:z.string().regex(/^ah-session-v1:[a-f0-9]{64}$/),programmeId,centreId:externalCentre,name:label,domain,status,
  sessionDate:z.iso.date(),updatedAt:stamp.nullable(),startTime:time,endTime:time,durationMinutes:count.nullable(),
  venues:z.array(z.object({name:label,type:label.nullable(),capacity:z.number().int().positive().nullable()})).max(50),
  frequency:frequency.nullable(),independentSession:z.boolean(),plannedPax:count.nullable(),fitnessRelated:z.boolean(),
  ...unknownProgrammeFields
});
const summary = z.object({
  centreId:externalCentre,sessionCount:count,programmeCount:count,scheduledCount:count,tbcCount:count,cancelledCount:count,
  explicitlyCompletedCount:count,programmeMinutes:count,programmeHours:z.number().nonnegative(),recordedPaxSessions:count,
  plannedPaxSum:count.nullable(),byDomain:z.record(domain,count)
});
const envelope = z.object({
  datasetVersion:z.literal(1),sourceSystem:z.literal('activityhub'),timezone:z.literal('Asia/Singapore'),
  retrievedAt:stamp,totalCount:count,reportingDates:z.object({
    centreId:externalCentre.nullable(),from:z.iso.date().nullable(),toExclusive:z.iso.date().nullable(),
    domain:domain.nullable(),status:status.nullable()
  })
});
const listing = shape => envelope.extend({
  data:z.array(shape).max(200),snapshot:z.string().regex(/^[a-f0-9]{64}$/),
  page:z.object({returnedCount:count,nextCursor:z.string().regex(/^[a-f0-9]{64}\.[1-9][0-9]{0,4}$/).nullable()})
});
const schemas = {
  health:envelope.extend({data:z.object({status:z.literal('ok'),sourceRead:z.literal('ok')})}),
  centres:envelope.extend({data:z.array(centre).max(4)}),
  datasets:envelope.extend({
    data:z.array(z.object({id:z.enum(['centres','programmes','sessions','upcoming','summary']),availability:z.literal('available'),grain:label})).max(5),
    unavailableFields:z.object({
      description:z.literal('no_source_field'),subdomain:z.literal('no_source_field'),
      hartRelated:z.literal('no_verified_classification'),completed:z.literal('no_completion_workflow'),
      programmeCapacity:z.literal('no_dedicated_capacity_field'),attendance:z.literal('no_source_dataset')
    })
  }),
  programmes:listing(programme),sessions:listing(session),upcoming:listing(session),summary:listing(summary)
};

export class SourceError extends Error {
  constructor(code,message) { super(message); this.code=code; }
}
export function activityHubConfig(env) {
  const url = URL.parse(env.ACTIVITYHUB_API_URL?.trim() || '');
  const key = env.ACTIVITYHUB_API_KEY?.trim();
  const valid = url?.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash &&
    /^\/functions\/v1\/management-reporting\/v1\/?$/.test(url.pathname);
  return valid && /^[a-f0-9]{64}$/i.test(key ?? '') ? {base:url.href.replace(/\/$/,''),key} : null;
}
const maxBytes=2_000_000;
async function readJson(response) {
  const reader=response.body?.getReader();
  if (!reader) throw new SourceError('INVALID_RESPONSE','ActivityHub returned an empty response.');
  let bytes=0;
  const decoder=new TextDecoder();
  let body='';
  try {
    while (true) {
      const {value,done}=await reader.read();
      if (done) break;
      bytes+=value.length;
      if (bytes>maxBytes) {
        await reader.cancel();
        throw new SourceError('RESPONSE_LIMIT','ActivityHub response exceeded the page size budget.');
      }
      body+=decoder.decode(value,{stream:true});
    }
    return JSON.parse(body+decoder.decode());
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError('INVALID_RESPONSE','ActivityHub response could not be read.');
  } finally { reader.releaseLock(); }
}
export function activityHubAdapter(config, fetcher=fetch) {
  async function get(route, scope, {cursor,etag,limit=100}={}) {
    if (!config) throw new SourceError('NOT_CONFIGURED','Configure the ActivityHub URL and API key on the server.');
    const url = new URL(config.base+'/'+route);
    if (scope) for (const [key,value] of Object.entries(scope)) url.searchParams.set(key,value);
    if (['programmes','sessions','upcoming'].includes(route)) {
      url.searchParams.set('limit',String(limit));
      if (cursor) url.searchParams.set('cursor',cursor);
    }
    const headers = {Accept:'application/json',Authorization:'Bearer '+config.key};
    if (etag && !cursor) headers['If-None-Match']=etag;
    let response;
    try {
      response=await fetcher(url,{method:'GET',headers,signal:AbortSignal.timeout(10000),redirect:'error',cache:'no-store'});
    } catch { throw new SourceError('SOURCE_UNAVAILABLE','ActivityHub did not respond within the request window.'); }
    if (response.status===304 && etag && !cursor) return {unchanged:true};
    if (!response.ok) {
      await response.body?.cancel();
      const errors={
        401:['INVALID_CREDENTIALS','ActivityHub rejected the API key.'],
        409:['SNAPSHOT_CHANGED_RESTART','ActivityHub changed during pagination. Start a new sync.'],
        429:['RATE_LIMITED','ActivityHub is rate limited. Wait one minute before retrying.']
      };
      const [code,message]=errors[response.status]??['SOURCE_UNAVAILABLE','ActivityHub returned HTTP '+response.status+'.'];
      throw new SourceError(code,message);
    }
    const parsed=schemas[route].safeParse(await readJson(response));
    if (!parsed.success) throw new SourceError('INVALID_RESPONSE','ActivityHub returned an invalid '+route+' response.');
    const data=parsed.data;
    if (scope && (data.reportingDates.centreId!==scope.centreId || data.reportingDates.from!==scope.from ||
      data.reportingDates.toExclusive!==scope.to || data.reportingDates.status!==null || data.reportingDates.domain!==null ||
      data.data.some(row=>row.centreId!==scope.centreId || ('sessionDate' in row && (row.sessionDate<scope.from || row.sessionDate>=scope.to)) ||
        (route==='upcoming' && !['scheduled','tbc'].includes(row.status))))) {
      throw new SourceError('WRONG_SCOPE','ActivityHub returned data outside the requested centre, dates or status.');
    }
    if (data.page && (data.page.returnedCount!==data.data.length || data.totalCount<data.data.length ||
      (data.page.nextCursor && !data.page.nextCursor.startsWith(data.snapshot+'.')))) {
      throw new SourceError('INVALID_PAGE','ActivityHub page metadata did not match its rows.');
    }
    return {data,etag:response.headers.get('etag')};
  }
  return {key:'activityhub',configured:!!config,test:()=>get('health'),centres:()=>get('centres'),datasets:()=>get('datasets'),get};
}
