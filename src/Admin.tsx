import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarDays, Database, Settings2 } from 'lucide-react';
import { addDays, fortnight, periodKinds, singaporeToday } from '../shared/reporting.js';
import { api, dateLabel, type Centre, type DataSource, type Workspace } from './api';
import { Badge, Empty, Failure, Field, Loading, Modal, SaveForm, value } from './ui';

const views=[['Centres',Building2],['Periods',CalendarDays],['Organisation',Settings2],['Data sources',Database]] as const;
type View = typeof views[number][0];
export function Admin({workspace,initial,refresh}:{workspace:Workspace;initial:View;refresh:(message:string)=>void}) {
  const [view,setView]=useState<View>(initial);
  return <>
    <div className="page-title"><div><div className="eyebrow">Administration</div><h1>{view}</h1><p>Manage the reporting workspace for {workspace.organisation}.</p></div></div>
    <div className="settings-nav">{views.map(([name,Icon])=><button key={name} aria-pressed={name===view} onClick={()=>setView(name)}><Icon size={17}/>{name}</button>)}</div>
    <section className="panel report-panel">
      {view==='Centres'&&<Centres workspace={workspace} refresh={refresh}/>}
      {view==='Periods'&&<Periods workspace={workspace} refresh={refresh}/>}
      {view==='Organisation'&&<Organisation workspace={workspace} refresh={refresh}/>}
      {view==='Data sources'&&<Sources workspace={workspace} refresh={refresh}/>}
    </section>
  </>;
}
type SettingsProps = {workspace:Workspace;refresh:(message:string)=>void};
function Centres({workspace,refresh}:SettingsProps) {
  const [edit,setEdit]=useState<Centre|null|undefined>();
  return <>
    <div className="panel-heading"><div><h2>Centre registry</h2><p>Inactive centres remain available for historical reporting.</p></div><button className="primary" onClick={()=>setEdit(null)}>Add centre</button></div>
    {workspace.centres.length?<div className="table-wrap"><table><thead><tr><th>Centre</th><th>Code</th><th>Status</th><th>Manage</th></tr></thead><tbody>
      {workspace.centres.map(centre=><tr key={centre.id}><td>{centre.name}</td><td>{centre.code}</td><td><Badge tone={centre.active?'green':'neutral'}>{centre.active?'Active':'Inactive'}</Badge></td><td><button onClick={()=>setEdit(centre)}>Edit</button></td></tr>)}</tbody></table></div>:<Empty title="No centres configured"/>}
    {edit!==undefined&&<Modal title={edit?'Edit centre':'Add centre'} close={()=>setEdit(undefined)}>
      <SaveForm onDone={()=>{setEdit(undefined);refresh('Centre saved');}} onSave={data=>api(edit?'/admin/centres/'+edit.id:'/admin/centres',edit?'PATCH':'POST',{name:value(data,'name'),code:value(data,'code'),active:data.has('active')})}>
        <Field label="Centre name"><input name="name" required maxLength={160} defaultValue={edit?.name}/></Field>
        <Field label="Centre code"><input name="code" required pattern="[A-Z0-9_\\-]{2,32}" defaultValue={edit?.code}/></Field>
        <label className="checkbox wide"><input name="active" type="checkbox" defaultChecked={edit?.active??true}/> Active</label>
      </SaveForm>
    </Modal>}
  </>;
}
function Periods({workspace,refresh}:SettingsProps) {
  const [adding,setAdding]=useState(false);
  const [offset,setOffset]=useState(0);
  const anchor=workspace.settings.fortnightAnchor;
  const suggestion=fortnight(addDays(singaporeToday(),offset*14),anchor);
  return <>
    <div className="panel-heading"><div><h2>Reporting periods</h2><p>Dates use Asia/Singapore. The fortnight anchor is {dateLabel(anchor)}.</p></div><button className="primary" onClick={()=>{setOffset(0);setAdding(true);}}>Add period</button></div>
    {workspace.periods.length?<div className="table-wrap"><table><thead><tr><th>Reporting period</th><th>Type</th><th>Start</th><th>End</th></tr></thead><tbody>
      {workspace.periods.map(period=><tr key={period.id}><td>{period.name}</td><td>{period.kind}</td><td>{dateLabel(period.start)}</td><td>{dateLabel(period.end)}</td></tr>)}</tbody></table></div>:<Empty title="No periods configured"/>}
    {adding&&<Modal title="Add reporting period" close={()=>setAdding(false)}>
      <div className="toolbar period-tools"><button onClick={()=>setOffset(offset-1)}>Earlier fortnight</button><button onClick={()=>setOffset(offset+1)}>Later fortnight</button></div>
      <SaveForm onDone={()=>{setAdding(false);refresh('Period saved');}} onSave={data=>api('/admin/periods','POST',{name:value(data,'name'),kind:value(data,'kind'),start:value(data,'start'),end:value(data,'end')})}>
        <Field label="Period name"><input name="name" required maxLength={160}/></Field>
        <Field label="Period type"><select name="kind">{periodKinds.map(kind=><option key={kind}>{kind}</option>)}</select></Field>
        <Field label="Start date"><input key={'start'+offset} name="start" type="date" required defaultValue={suggestion.start}/></Field>
        <Field label="End date"><input key={'end'+offset} name="end" type="date" required defaultValue={suggestion.end}/></Field>
      </SaveForm>
    </Modal>}
  </>;
}
function Organisation({workspace,refresh}:SettingsProps) {
  return <><div className="panel-heading"><div><h2>Branding and reporting calendar</h2><p>Changes apply to this organisation.</p></div></div>
    <div className="settings-form"><SaveForm onDone={()=>refresh('Organisation settings saved')} onSave={data=>api('/admin/settings','PUT',{
      name:value(data,'name'),logoUrl:value(data,'logoUrl')||null,fiscalStartMonth:Number(value(data,'fiscalStartMonth')),fortnightAnchor:value(data,'fortnightAnchor')
    })}>
      <Field label="Organisation name"><input name="name" required defaultValue={workspace.organisation} maxLength={160}/></Field>
      <Field label="Logo URL (HTTPS)"><input name="logoUrl" type="url" defaultValue={workspace.settings.logoUrl??''}/></Field>
      <Field label="Financial year starts in"><select name="fiscalStartMonth" defaultValue={workspace.settings.fiscalStartMonth}>
        {Array.from({length:12},(_,index)=><option key={index} value={index+1}>{new Intl.DateTimeFormat('en-SG',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,index,1)))}</option>)}</select></Field>
      <Field label="Fortnight anchor date"><input name="fortnightAnchor" type="date" required defaultValue={workspace.settings.fortnightAnchor}/></Field>
    </SaveForm></div></>;
}
function Sources({workspace,refresh}:SettingsProps) {
  const [key,setKey]=useState('');
  const [remove,setRemove]=useState<{id:string;alias:string}|null>(null);
  const sources=useQuery({queryKey:['sources'],queryFn:()=>api<DataSource[]>('/admin/sources')});
  const selected=sources.data?.find(source=>source.key===key);
  const active=workspace.centres.filter(centre=>centre.active);
  return <>
    <div className="panel-heading"><div><h2>Source registry</h2><p>Connections and imports become available when their adapters are implemented and verified.</p></div></div>
    {sources.isPending?<Loading/>:sources.isError?<Failure error={sources.error}/>:<div className="table-wrap"><table>
      <thead><tr><th>Source</th><th>Type</th><th>Planned datasets</th><th>Connection</th><th>Last successful sync</th><th>Centre mapping</th></tr></thead>
      <tbody>{sources.data.map(source=><tr key={source.key}><td><strong>{source.name}</strong></td><td>{source.type}</td><td>{source.datasets.join(' · ')}</td><td><Badge>{source.status}</Badge></td><td>—</td><td><button onClick={()=>setKey(source.key)}>Manage aliases ({source.aliases.length})</button></td></tr>)}</tbody></table></div>}
    {selected&&<Modal title={selected.name+' centre aliases'} close={()=>{setKey('');setRemove(null);}}>
      <p>Enter the exact centre label or code used by the source.</p>
      {selected.aliases.length>0&&<div className="table-wrap"><table><thead><tr><th>Source alias</th><th>Hub centre</th><th>Manage</th></tr></thead><tbody>
        {selected.aliases.map(mapping=><tr key={mapping.id}><td>{mapping.alias}</td><td>{workspace.centres.find(centre=>centre.id===mapping.centreId)?.name}</td>
          <td><button onClick={()=>setRemove(mapping)}>Remove</button></td></tr>)}
      </tbody></table></div>}
      {remove?<SaveForm label="Remove alias" onDone={()=>{setRemove(null);refresh('Alias removed');}} onSave={()=>api('/admin/sources/aliases/'+remove.id+'/remove','POST')}>
        <p className="wide">Remove the mapping for {remove.alias}?</p><button type="button" onClick={()=>setRemove(null)}>Cancel</button>
      </SaveForm>:active.length?<SaveForm label="Add alias" onDone={()=>{setKey('');refresh('Alias saved');}} onSave={data=>api('/admin/sources/'+selected.key+'/aliases','POST',{alias:value(data,'alias'),centreId:value(data,'centreId')})}>
        <Field label="Source centre alias"><input name="alias" required maxLength={160}/></Field>
        <Field label="Hub centre"><select name="centreId">{active.map(centre=><option key={centre.id} value={centre.id}>{centre.name}</option>)}</select></Field>
      </SaveForm>:<Empty title="Create an active centre to add an alias"/>}
    </Modal>}
  </>;
}