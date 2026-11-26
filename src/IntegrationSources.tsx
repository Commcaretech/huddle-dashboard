import { useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { tabs,singaporeToday,addDays,addMonths } from '../shared/reporting.js';
import { coverageCatalogue } from '../shared/integration-coverage.js';
import { api,dateLabel,type Workspace } from './api';
import { useIntegrationAccess } from './integration-access';
import { Badge,Empty,Failure,Field,Loading,SaveForm,value } from './ui';

type Counts={retrieved:number;inserted:number;updated:number;rejected:number;removed:number};
type Scope={centreId:string;from:string;to:string};
type Job={id:string;status:string;startedAt:string;finishedAt:string|null;counts:Counts;error:string|null;
  progress:{dataset:string;scope:Scope;retrieved:number}|null};
type Source={key:string;name:string;type:string;datasets:string[];configured:boolean;status:string;enabled?:boolean;tabs?:string[];
  connection?:string;lastSuccess?:string;lastAttempt?:string;counts?:Counts;freshness?:string;onboarding?:string;
  aliases?:{id:string;alias:string;centreId:string}[];history?:Job[];definitions?:{id:string;grain:string}[];
  periods?:{externalCentre:string;from:string;to:string;refreshedAt:string}[];issues?:{id:string;code:string;detail:string}[]};
type Registry={authorised:boolean;sources:Source[]};
type Preview={totalCount:number;data:{id:string;programmeId:string;name:string;sessionDate:string;status:string;hart:boolean;highlight:boolean}[]};
const codes=['SEEN_BB','GLOW_BB','SEEN_NY','GLOW_NY'];
const displayTime=(date:string|undefined)=>date?new Intl.DateTimeFormat('en-SG',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Singapore'}).format(new Date(date)):'Unavailable';

export function IntegrationSources({workspace}:{workspace:Workspace}) {
  const access=useIntegrationAccess();
  const [unlockError,setUnlockError]=useState('');
  const queryClient=useQueryClient();
  const registry=useQuery({queryKey:['integration-sources',!!access.key],
    queryFn:()=>api<Registry>('/admin/sources','GET',undefined,access.key)});
  async function unlock(data:FormData) {
    const key=value(data,'key').trim();
    const checked=await api<Registry>('/admin/sources','GET',undefined,key);
    if (!checked.authorised) {setUnlockError('This key could not unlock integrations. Check the server operator key.');return;}
    setUnlockError('');
    queryClient.setQueryData(['integration-sources',true],checked);
    access.setKey(key);
  }
  return <>
    <div className="panel-heading"><div><h2>Source registry</h2><p>ActivityHub is the first read-only integration.</p></div>
      {registry.data?.authorised&&<button onClick={()=>{access.setKey('');queryClient.removeQueries({queryKey:['integration-sources',true]});queryClient.removeQueries({queryKey:['integrated-report']});}}>Lock integrations</button>}</div>
    {registry.isPending?<Loading/>:registry.isError?<Failure error={registry.error}/>:<>
      {!registry.data.authorised&&<div className="settings-form"><SaveForm label="Unlock integrations" onDone={()=>{}} onSave={unlock}>
        <Field label="Integration operator key" wide><input type="password" name="key" autoComplete="off" required/></Field>
      </SaveForm><Failure error={unlockError}/></div>}
      <div className="table-wrap"><table><thead><tr><th>Source</th><th>Status</th><th>Datasets</th><th>Last successful sync</th><th>Freshness</th></tr></thead>
        <tbody>{registry.data.sources.map(source=><tr key={source.key}>
          <td><strong>{source.name}</strong><p>{source.type}</p></td><td><Badge>{source.status}</Badge></td>
          <td>{source.datasets.join(' · ')}{source.onboarding&&<p>{source.onboarding}</p>}</td>
          <td>{displayTime(source.lastSuccess)}</td><td>{source.freshness??'Unavailable'}</td>
        </tr>)}</tbody></table></div>
      {registry.data.authorised&&registry.data.sources.filter(source=>source.key==='activityhub').map(source=>
        <ActivityHub key={source.key} source={source} workspace={workspace} operatorKey={access.key}
          refresh={()=>{void queryClient.invalidateQueries({queryKey:['integration-sources']});void queryClient.invalidateQueries({queryKey:['integrated-report']});}}/>)}
      {registry.data.authorised&&<OtherMappings sources={registry.data.sources.filter(source=>source.key!=='activityhub')} workspace={workspace}
        operatorKey={access.key} refresh={()=>void queryClient.invalidateQueries({queryKey:['integration-sources']})}/>}
      <Coverage synchronised={!!registry.data.sources.find(source=>source.key==='activityhub')?.lastSuccess}/>
    </>}
  </>;
}
function ActivityHub({source,workspace,operatorKey,refresh}:{source:Source;workspace:Workspace;operatorKey:string;refresh:()=>void}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<unknown>();
  const [note,setNote]=useState('');
  const [connection,setConnection]=useState<{centres:{centreId:string;name:string}[];unavailable:Record<string,string>}>();
  const [preview,setPreview]=useState<Preview>();
  const [job,setJob]=useState<Job>();
  const [from,setFrom]=useState(workspace.periods[0]?.start??singaporeToday());
  const [end,setEnd]=useState(workspace.periods[0]?.end??addDays(addMonths(singaporeToday(),3),-1));
  const [external,setExternal]=useState('');
  const [selectedProgramme,setSelectedProgramme]=useState('');
  const mappings=source.aliases??[];
  const selected=mappings.find(mapping=>mapping.alias===external)??mappings[0];
  const active=workspace.centres.filter(centre=>centre.active);
  const current=source.history?.find(item=>item.status==='running');
  const path='/admin/sources/activityhub';
  const call=<T,>(route:string,method='POST',data?:unknown)=>api<T>(route,method,data,operatorKey);
  const scope=()=>({centreId:selected?.alias,from,to:end?addDays(end,1):''});
  async function work(task:()=>Promise<void>) {
    if (busy) return;
    setBusy(true);setError(undefined);setNote('');
    try {await task();}
    catch(failure){setError(failure);}
    finally{setBusy(false);refresh();}
  }
  async function runScope(all:boolean,resume?:Job,centre=selected?.alias) {
    let result=resume??await call<Job>(all?'/admin/sources/sync-all':path+'/sync','POST',{...scope(),centreId:centre});
    setJob(result);
    for(let batch=0;result.status==='running'&&batch<130;batch++){
      result=await call<Job>(path+'/sync/'+result.id+'/advance');
      setJob(result);
    }
    return result;
  }
  async function sync(all:boolean,resume?:Job) {
    if (all) {
      const results=[];
      for (const mapping of mappings.filter(item=>active.some(centre=>centre.id===item.centreId))) {
        const result=await runScope(true,undefined,mapping.alias);
        results.push(mapping.alias+' '+result.status);
        if (result.status==='running') break;
      }
      setNote(results.join(' · '));
      return;
    }
    const result=await runScope(false,resume);
    setNote(result.status==='published'?'Snapshot published.':result.status==='running'?'Progress saved. Resume the sync to continue.':result.error??'Synchronisation failed.');
  }
  return <div className="settings-form">
    <h2>ActivityHub controls</h2>
    <p>Connected tabs: {(source.tabs??[]).map(id=>tabs.find(tab=>tab.id===id)?.name).join(', ')}</p>
    <p>Connection: {source.connection??'Not tested'}</p>
    <p>Last attempted sync: {displayTime(source.lastAttempt)}</p>
    {source.counts&&<CountsLine counts={source.counts}/>}
    {!source.configured&&<p>Set ACTIVITYHUB_API_URL and ACTIVITYHUB_API_KEY on the server.</p>}
    <div className="entry-buttons">
      <button disabled={busy||!source.configured} onClick={()=>void work(async()=>{setConnection(await call(path+'/test'));setNote('Connection test passed.');})}>Test connection</button>
      <button disabled={busy||!source.configured} onClick={()=>void work(async()=>{await call(path,'PATCH',{enabled:!source.enabled});setNote(source.enabled?'Source disabled.':'Source enabled.');})}>{source.enabled?'Disable source':'Enable source'}</button>
    </div>
    {connection&&<p>Discovered centres: {connection.centres.map(centre=>centre.name+' ('+centre.centreId+')'+(mappings.some(mapping=>mapping.alias===centre.centreId)?'':' · unmapped')).join(', ')}</p>}
    <details><summary>Dataset definitions</summary>
      {source.definitions?.length?<ul>{source.definitions.map(item=><li key={item.id}>{item.id}: {item.grain}</li>)}</ul>:<p>Run Test connection to retrieve dataset definitions.</p>}
      <p>Programme capacity, attendance and verified H.ART classification are unavailable from ActivityHub.</p>
    </details>
    <details><summary>Centre mapping</summary>
      {mappings.map(mapping=><div className="entry-buttons" key={mapping.id}><span>{mapping.alias} → {workspace.centres.find(centre=>centre.id===mapping.centreId)?.name}</span>
        <button disabled={busy} onClick={()=>void work(async()=>{await call('/admin/sources/aliases/'+mapping.id+'/remove');setNote('Mapping removed.');})}>Remove mapping</button></div>)}
      {active.length?<SaveForm label="Save mapping" onDone={refresh}
        onSave={data=>call(path+'/aliases','POST',{alias:value(data,'alias'),centreId:value(data,'centre')})}>
        <Field label="ActivityHub centre code"><select name="alias">{codes.map(code=><option key={code}>{code}</option>)}</select></Field>
        <Field label="Hub centre"><select name="centre">{active.map(centre=><option key={centre.id} value={centre.id}>{centre.name}</option>)}</select></Field>
      </SaveForm>:<p>Add a centre under Settings before mapping.</p>}
    </details>
    <div className="form-grid" style={{marginTop:12}}>
      <Field label="Mapped ActivityHub centre"><select disabled={!mappings.length} value={selected?.alias??''} onChange={event=>{setExternal(event.target.value);setPreview(undefined);}}>
        {!mappings.length&&<option value="">No centre mapped</option>}{mappings.map(mapping=><option key={mapping.id}>{mapping.alias}</option>)}</select></Field>
      <Field label="Start date"><input type="date" value={from} onChange={event=>{setFrom(event.target.value);setPreview(undefined);}}/></Field>
      <Field label="End date (inclusive)"><input type="date" value={end} onChange={event=>{setEnd(event.target.value);setPreview(undefined);}}/></Field>
    </div>
    <div className="entry-buttons">
      <button disabled={busy||!selected||!from||!end||!source.configured} onClick={()=>void work(async()=>{setPreview(await call(path+'/preview','POST',scope()));setSelectedProgramme('');})}>Preview available data</button>
      <button disabled={busy||!selected||!from||!end||!source.enabled||!source.configured} onClick={()=>void work(()=>sync(false))}>Sync now</button>
      <button disabled={busy||!selected||!from||!end||!source.enabled||!source.configured} onClick={()=>void work(()=>sync(true))}>Sync all</button>
      {current&&<button disabled={busy||!source.enabled} onClick={()=>void work(()=>sync(false,current))}>Resume sync</button>}
    </div>
    <p>Sync all runs enabled adapters for all active mapped centres in this date range. ActivityHub is the only implemented adapter.</p>
    {busy&&<p role="status">{job?.progress?'Syncing '+job.progress.dataset+' · '+job.progress.retrieved+' retrieved':'Working…'}</p>}
    {note&&<p role="status">{note}</p>}<Failure error={error}/>
    {preview&&<><h3>ActivityHub preview</h3><p>{preview.totalCount} eligible occurrences. Showing the first {preview.data.length}.</p>
      <ul>{preview.data.map(row=><li key={row.id}>{dateLabel(row.sessionDate)} · {row.name} · {row.status}</li>)}</ul>
      {!!preview.data.length&&selected&&<SaveForm key={selected.alias} label="Save programme classification" onDone={()=>{setNote('Programme classification saved.');refresh();}}
        onSave={data=>call(path+'/programme-flags','PUT',{externalCentre:selected.alias,externalId:selectedProgramme,hart:data.has('hart'),highlight:data.has('highlight')})}>
        <Field label="Programme"><select required value={selectedProgramme} onChange={event=>setSelectedProgramme(event.target.value)}><option value="">Choose a programme</option>
          {[...new Map(preview.data.map(row=>[row.programmeId,row.name])).entries()].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></Field>
        <label className="checkbox"><input key={selectedProgramme} name="hart" type="checkbox" defaultChecked={preview.data.find(row=>row.programmeId===selectedProgramme)?.hart}/> Approved H.ART</label>
        <label className="checkbox"><input key={selectedProgramme} name="highlight" type="checkbox" defaultChecked={preview.data.find(row=>row.programmeId===selectedProgramme)?.highlight}/> Management highlight</label>
      </SaveForm>}
    </>}
    <details><summary>Available reporting periods</summary>
      {source.periods?.length?<ul>{source.periods.map(period=><li key={period.externalCentre+period.from+period.to}>{period.externalCentre} · {dateLabel(period.from)} to {dateLabel(addDays(period.to,-1))} · {displayTime(period.refreshedAt)}</li>)}</ul>:<p>No published scopes.</p>}
    </details>
    <details><summary>Sync history and issues</summary>
      {source.history?.length?<ul>{source.history.map(item=><li key={item.id}>{displayTime(item.startedAt)} · {item.status}<CountsLine counts={item.counts}/>{item.error&&<p>{item.error}</p>}</li>)}</ul>:<p>No sync history yet.</p>}
      {source.issues?.map(issue=><p key={issue.id}>{issue.code}: {issue.detail}</p>)}
    </details>
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
    {source?.aliases?.map(mapping=><div className="entry-buttons" key={mapping.id}>
      <span>{mapping.alias} → {workspace.centres.find(centre=>centre.id===mapping.centreId)?.name}</span>
      <button onClick={()=>void api('/admin/sources/aliases/'+mapping.id+'/remove','POST',{},operatorKey).then(refresh).catch(setError)}>Remove mapping</button>
    </div>)}
    <Failure error={error}/>
    {source&&active.length>0&&<SaveForm key={source.key} label="Save mapping" onDone={refresh}
      onSave={data=>api('/admin/sources/'+source.key+'/aliases','POST',{alias:value(data,'alias'),centreId:value(data,'centre')},operatorKey)}>
      <Field label="Exact source alias"><input name="alias" required maxLength={160}/></Field>
      <Field label="Hub centre"><select name="centre">{active.map(centre=><option key={centre.id} value={centre.id}>{centre.name}</option>)}</select></Field>
    </SaveForm>}
  </details>;
}
function CountsLine({counts}:{counts:Counts}) {
  return <p>Retrieved {counts.retrieved??0} · inserted {counts.inserted??0} · updated {counts.updated??0} · rejected {counts.rejected??0} · removed {counts.removed??0}</p>;
}
function Coverage({synchronised}:{synchronised:boolean}) {
  const [tab,setTab]=useState('');
  const labels:Record<string,string>={source:synchronised?'Available and synchronised for published scopes':'Available but not connected',
    classification:'Requires organisational confirmation',manual:'Requires manual submission',confirm:'Requires organisational confirmation',
    pending:'Available but not connected',missing:'Missing from source',restricted:'Restricted due to privacy requirements'};
  return <section className="report-panel"><div className="panel-heading"><div><h2>Data coverage</h2><p>Coverage is listed by reporting metric. Each report shows its actual centre and date scope.</p></div>
    <select aria-label="Coverage reporting tab" value={tab} onChange={event=>setTab(event.target.value)}><option value="">All reporting tabs</option>{tabs.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    <div className="table-wrap"><table><thead><tr><th>Reporting tab</th><th>Metric or record</th><th>Coverage</th></tr></thead><tbody>
      {coverageCatalogue.filter(row=>!tab||row[0]===tab).map(([tabId,metric,status])=><tr key={tabId+metric}><td>{tabs.find(item=>item.id===tabId)?.name}</td><td>{metric}</td><td>{labels[status]}</td></tr>)}
    </tbody></table></div><Empty title="ActivityHub source limits">Attendance and demographic reporting require separate approved datasets.</Empty>
  </section>;
}
