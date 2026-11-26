import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {tabs,singaporeToday} from '../shared/reporting.js';
import {coverageCatalogue} from '../shared/integration-coverage.js';
import {api,dateLabel,type Workspace} from './api';
import {useIntegrationAccess} from './integration-access';
import {Badge,Failure,Field,Loading,SaveForm,value} from './ui';

type Counts={retrieved:number;inserted:number;updated:number;rejected:number;removed:number};
type Range={from:string;to:string};
type Job={id:string;status:string;startedAt:string;counts:Counts;error:string|null;progress:{dataset:string;retrieved:number;scope:Range}|null};
export type MetricDefinition={id:string;displayName:string;unit:string;methodology:string;availability:string;availableDateRange:Range|null;approved:boolean};
type Dataset={id:string;metrics:MetricDefinition[];classifications?:string[]};
type Source={key:string;name:string;type:string;centre?:string;datasets:string[];status:string;configured:boolean;enabled?:boolean;tabs?:string[];
  publishedMetrics?:Record<string,string[]>;lastSuccess?:string;lastAttempt?:string;counts?:Counts;freshness?:string;connection?:string;onboarding?:string;
  aliases?:{id:string;alias:string;centreId:string}[];history?:Job[];definitions?:Dataset[];
  periods?:(Range&{refreshedAt:string})[];issues?:{id:string;code:string;detail:string}[]};
type Registry={authorised:boolean;sources:Source[]};
const glowPath='/admin/sources/glowbb';
const time=(value?:string)=>value?new Intl.DateTimeFormat('en-SG',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Singapore'}).format(new Date(value)):'Unavailable';

export function IntegrationSources({workspace}:{workspace:Workspace}) {
  const access=useIntegrationAccess();
  const queryClient=useQueryClient();
  const registry=useQuery({queryKey:['integration-sources',!!access.key],
    queryFn:()=>api<Registry>('/admin/sources','GET',undefined,access.key)});
  const refresh=()=>{void queryClient.invalidateQueries({queryKey:['integration-sources']});void queryClient.invalidateQueries({queryKey:['integrated-report']});};
  async function unlock(data:FormData) {
    const key=value(data,'key').trim();
    const result=await api<Registry>('/admin/sources','GET',undefined,key);
    if(!result.authorised) throw new Error('This key could not unlock integrations.');
    queryClient.setQueryData(['integration-sources',true],result);
    access.setKey(key);
  }
  const source=registry.data?.sources.find(item=>item.key==='glowbb');
  return <>
    <div className="panel-heading"><div><h2>Source registry</h2><p>Read-only aggregate reporting for GLOW Bukit Batok.</p></div>
      {registry.data?.authorised&&<button onClick={()=>{access.setKey('');queryClient.removeQueries({queryKey:['integration-sources',true]});queryClient.removeQueries({queryKey:['integrated-report']});}}>Lock integrations</button>}</div>
    {registry.isPending?<Loading/>:registry.isError?<Failure error={registry.error}/>:<>
      {!registry.data.authorised&&<div className="settings-form"><SaveForm label="Unlock integrations" onDone={()=>{}} onSave={unlock}>
        <Field label="Integration operator key" wide><input type="password" name="key" required autoComplete="off"/></Field>
      </SaveForm></div>}
      <div className="table-wrap"><table><thead><tr><th>Source</th><th>Centre</th><th>Status</th><th>Last successful sync</th><th>Freshness</th></tr></thead>
        <tbody>{registry.data.sources.map(item=><tr key={item.key}><td><strong>{item.name}</strong><p>{item.type}</p>{item.onboarding&&<p>{item.onboarding}</p>}</td>
          <td>{item.centre??'Unassigned'}</td><td><Badge>{item.status}</Badge></td><td>{time(item.lastSuccess)}</td><td>{item.freshness??'Unavailable'}</td></tr>)}</tbody></table></div>
      {registry.data.authorised&&source&&<GlowControls source={source} workspace={workspace} operatorKey={access.key} refresh={refresh}/>}
      {registry.data.authorised&&<OtherMappings sources={registry.data.sources.filter(item=>item.key!=='glowbb')} workspace={workspace} operatorKey={access.key} refresh={refresh}/>}
      <Coverage source={source}/>
    </>}
  </>;
}

function GlowControls({source,workspace,operatorKey,refresh}:{source:Source;workspace:Workspace;operatorKey:string;refresh:()=>void}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<unknown>();
  const [note,setNote]=useState('');
  const [job,setJob]=useState<Job>();
  const [preview,setPreview]=useState<{dataset:string;metadata:{status?:string;metrics?:Record<string,{value:number|null;status:string;unit:string}>}}>();
  const today=singaporeToday();
  const [from,setFrom]=useState(workspace.periods[0]?.start??today.slice(0,7)+'-01');
  const [to,setTo]=useState([workspace.periods[0]?.end??today,today].sort()[0]);
  const active=workspace.centres.filter(item=>item.active&&['GLOW_BB','GLOW_BUKIT_BATOK'].includes(item.code.toUpperCase()));
  const mapped=source.aliases?.find(item=>item.alias==='glow_bukit_batok');
  const pending=source.history?.find(item=>item.status==='running');
  const ready=source.configured&&!!mapped&&source.enabled&&!!source.definitions?.length;
  const call=<T,>(path:string,method='POST',body?:unknown)=>api<T>(path,method,body,operatorKey);
  async function work(task:()=>Promise<void>){
    if(busy)return;
    setBusy(true);setError(undefined);setNote('');
    try{await task();}catch(failure){setError(failure);}finally{setBusy(false);refresh();}
  }
  async function sync(path:string,resume?:Job){
    let current=resume??await call<Job>(path,'POST',path.endsWith('/historical')?{}:{from,to});
    setJob(current);
    for(let batch=0;current.status==='running'&&batch<200;batch++){
      current=await call<Job>(glowPath+'/sync/'+current.id+'/advance');
      setJob(current);
    }
    setNote(current.status==='published'?'Snapshot published.':current.status==='running'?'Progress saved. Resume the sync to continue.':current.error??'Synchronisation failed.');
  }
  return <div className="settings-form">
    <h2>GlowBBDashboard controls</h2>
    <p>Centre: GLOW Bukit Batok</p><p>Connection: {source.connection??'Not tested'}</p>
    <p>Last attempted sync: {time(source.lastAttempt)}</p>
    {source.counts&&<CountsLine counts={source.counts}/>}
    {!source.configured&&<p>Set GLOWBB_REPORTING_BASE_URL and GLOWBB_API_KEY on the server.</p>}
    <div className="entry-buttons">
      <button disabled={busy||!source.configured} onClick={()=>void work(async()=>{await call(glowPath+'/test');setNote('Connection verified and catalogue saved.');})}>Test connection</button>
      <button disabled={busy||(!source.configured&&!source.enabled)} onClick={()=>void work(async()=>{await call(glowPath,'PATCH',{enabled:!source.enabled});setNote(source.enabled?'Source disabled.':'Source enabled.');})}>{source.enabled?'Disable source':'Enable source'}</button>
    </div>
    <details><summary>Centre mapping</summary>
      {mapped?<div className="entry-buttons"><span>glow_bukit_batok → {workspace.centres.find(centre=>centre.id===mapped.centreId)?.name}</span>
        <button disabled={busy} onClick={()=>void work(async()=>{await call('/admin/sources/aliases/'+mapped.id+'/remove');setNote('Mapping removed.');})}>Remove mapping</button></div>:
        active.length?<SaveForm label="Save mapping" onDone={refresh}
          onSave={data=>call(glowPath+'/aliases','POST',{alias:'glow_bukit_batok',centreId:value(data,'centre')})}>
          <Field label="GLOW Bukit Batok Hub centre"><select name="centre">{active.map(centre=><option key={centre.id} value={centre.id}>{centre.name}</option>)}</select></Field>
        </SaveForm>:<p>Create an active GLOW Bukit Batok centre with code GLOW_BB or GLOW_BUKIT_BATOK.</p>}
    </details>
    <div className="form-grid">
      <Field label="Start date (inclusive)"><input type="date" max={today} value={from} onChange={event=>{setFrom(event.target.value);setPreview(undefined);}}/></Field>
      <Field label="End date (inclusive)"><input type="date" max={today} value={to} onChange={event=>{setTo(event.target.value);setPreview(undefined);}}/></Field>
    </div>
    <div className="entry-buttons">
      <button disabled={busy||!source.configured||!mapped||!source.definitions?.length||!from||!to} onClick={()=>void work(async()=>setPreview(await call(glowPath+'/preview','POST',{from,to})))}>Preview data</button>
      <button disabled={busy||!ready||!from||!to} onClick={()=>void work(()=>sync(glowPath+'/sync'))}>Sync now</button>
      <button disabled={busy||!ready} onClick={()=>void work(()=>sync(glowPath+'/historical'))}>Sync historical data</button>
      <button disabled={busy||!ready||!from||!to} onClick={()=>void work(()=>sync('/admin/sources/sync-all'))}>Sync all</button>
      {pending&&<button disabled={busy||!ready} onClick={()=>void work(()=>sync(glowPath+'/sync',pending))}>Resume sync</button>}
    </div>
    {busy&&<p role="status">{job?.progress?'Syncing '+job.progress.dataset+' · '+job.progress.retrieved+' received':'Working…'}</p>}
    {note&&<p role="status">{note}</p>}<Failure error={error}/>
    {preview&&<details open><summary>Read-only preview · {preview.dataset}</summary>
      {preview.metadata.metrics? <ul>{Object.entries(preview.metadata.metrics).map(([id,cell])=><li key={id}>{id}: {typeof cell.value==='number'?cell.value+' '+cell.unit:cell.status}</li>)}</ul>:<p>No released summary metrics for these dates.</p>}
    </details>}
    <details><summary>View available metrics</summary>
      {source.definitions?.length?source.definitions.map(item=><div key={item.id}><h3>{item.id}</h3>
        {item.classifications?.length&&<p>Source classifications: {item.classifications.join(', ')}</p>}
        <ul>{item.metrics.map(metric=><li key={metric.id}><strong>{metric.displayName}</strong> · {metric.unit} · {!metric.approved?'Requires approval':source.publishedMetrics?.[item.id]?.includes(metric.id)?'Successfully synchronised':metric.availability==='source_present'?'Available but not yet released in the latest sync':'Missing source data'}
          {metric.availableDateRange?.from&&metric.availableDateRange.to&&' · '+dateLabel(metric.availableDateRange.from)+' to '+dateLabel(metric.availableDateRange.to)}
          <p>{metric.methodology}</p></li>)}</ul></div>):<p>Run Test connection to discover source metrics.</p>}
    </details>
    <details><summary>View sync history</summary>
      {source.history?.length?<ul>{source.history.map(item=><li key={item.id}>{time(item.startedAt)} · {item.status}<CountsLine counts={item.counts}/>{item.error&&<p>{item.error}</p>}</li>)}</ul>:<p>No sync history.</p>}
    </details>
    <details><summary>Historical data coverage</summary>
      {source.periods?.length?<ul>{source.periods.map(period=><li key={period.from+period.to}>{dateLabel(period.from)} to {dateLabel(period.to)} · {time(period.refreshedAt)}</li>)}</ul>:<p>No published periods.</p>}
    </details>
    <details><summary>View errors</summary>{source.issues?.length?source.issues.map(issue=><p key={issue.id}>{issue.code}: {issue.detail}</p>):<p>No recorded errors.</p>}</details>
  </div>;
}
function OtherMappings({sources,workspace,operatorKey,refresh}:{sources:Source[];workspace:Workspace;operatorKey:string;refresh:()=>void}) {
  const [key,setKey]=useState(sources[0]?.key??'');
  const [error,setError]=useState<unknown>();
  const source=sources.find(item=>item.key===key);
  const active=workspace.centres.filter(centre=>centre.active);
  return <details className="settings-form"><summary>Centre aliases for other sources</summary>
    <Field label="Source for aliases"><select value={key} onChange={event=>{setKey(event.target.value);setError(undefined);}}>
      {sources.map(item=><option key={item.key} value={item.key}>{item.name}</option>)}</select></Field>
    {source?.aliases?.map(mapping=><div className="entry-buttons" key={mapping.id}><span>{mapping.alias} → {workspace.centres.find(centre=>centre.id===mapping.centreId)?.name}</span>
      <button onClick={()=>void api('/admin/sources/aliases/'+mapping.id+'/remove','POST',{},operatorKey).then(refresh).catch(setError)}>Remove mapping</button></div>)}
    <Failure error={error}/>
    {source&&active.length>0&&<SaveForm key={source.key} label="Save mapping" onDone={refresh}
      onSave={data=>api('/admin/sources/'+source.key+'/aliases','POST',{alias:value(data,'alias'),centreId:value(data,'centre')},operatorKey)}>
      <Field label="Exact source alias"><input name="alias" required maxLength={160}/></Field>
      <Field label="Hub centre"><select name="centre">{active.map(centre=><option key={centre.id} value={centre.id}>{centre.name}</option>)}</select></Field>
    </SaveForm>}
  </details>;
}
function CountsLine({counts}:{counts:Counts}) {
  return <p>Received {counts.retrieved??0} · inserted {counts.inserted??0} · updated {counts.updated??0} · rejected {counts.rejected??0} · removed {counts.removed??0}</p>;
}
function Coverage({source}:{source?:Source}) {
  const [tab,setTab]=useState('');
  const labels:Record<string,string>={manual:'Requires manual entry',confirm:'Requires management confirmation',pending:'Missing source connection',
    missing:'Missing source data',restricted:'Restricted information'};
  return <section className="report-panel"><div className="panel-heading"><div><h2>Data coverage</h2><p>Published snapshots are scoped to GLOW Bukit Batok and exact dates.</p></div>
    <select aria-label="Coverage reporting tab" value={tab} onChange={event=>setTab(event.target.value)}><option value="">All reporting tabs</option>{tabs.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    <div className="table-wrap"><table><thead><tr><th>Reporting tab</th><th>Metric or record</th><th>Coverage</th></tr></thead><tbody>
      {coverageCatalogue.filter(row=>!tab||row[0]===tab).map(([tabId,metric,status,dataset])=>{
        const available=source?.definitions?.find(item=>item.id===dataset)?.metrics.some(item=>item.approved&&item.availability==='source_present');
        const current=status==='source'?(available?(source?.publishedMetrics?.[dataset]?.length?'Successfully synchronised for at least one metric in the latest scope':'Available but not yet synchronised'):'Missing source data or discovery pending'):labels[status];
        return <tr key={tabId+metric}><td>{tabs.find(item=>item.id===tabId)?.name}</td><td>{metric}</td><td>{current}</td></tr>;
      })}
    </tbody></table></div>
  </section>;
}
