import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, BarChart3, CalendarDays, ClipboardCheck, Layers3, Plus, Search } from 'lucide-react';
import { api, canWrite, dateLabel, params, type Centre, type Entry, type Period, type Report, type Workspace } from './api';
import { addDays, dateWindow, modules, priorities, singaporeToday, type Tab } from '../shared/reporting.js';
import { Badge, Empty, Failure, Field, Loading, Modal, PageControls, SaveForm, value } from './ui';
import { IntegratedReport, activityHubTabs } from './IntegratedReport';
import { useIntegrationAccess } from './integration-access';

type Props = {tab:Tab; workspace:Workspace; centreId:string; period:Period; presenting:boolean; refresh:(message:string)=>void};
const indicatorIcons = [Activity, BarChart3, Layers3, ClipboardCheck];

export function Reporting({tab,workspace,centreId,period,presenting,refresh}:Props) {
  const [page,setPage]=useState(1);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('');
  const [archived,setArchived]=useState(false);
  const [view,setView]=useState('List');
  const [edit,setEdit]=useState<Entry|null|undefined>();
  const [archive,setArchive]=useState<Entry|null>(null);
  const [addingConclusion,setAddingConclusion]=useState(false);
  const kind = 'module' in tab ? tab.module : '';
  const integration = useIntegrationAccess();
  const definition = modules[kind];
  const writableCentres = workspace.centres.filter(centre=>centre.active && (!centreId || centre.id===centreId));
  const editable = canWrite(workspace.user.role) && !!writableCentres.length && !presenting;
  const report = useQuery({
    queryKey:['report',tab.id,centreId,period.id,archived,page,presenting,search,filter],
    queryFn:()=>api<Report>('/reports/'+tab.id+params({centreId,periodId:period.id,archived:String(archived&&!presenting),page,search:presenting?'':search,filter:presenting?'':filter}))
  });
  const window = report.data?.window ?? dateWindow(tab.id,period);
  const visible = report.data?.rows ?? [];
  const viewOptions = tab.id === 'logistics' ? ['List','Status board'] : tab.id === 'next-two-weeks' ? ['List','Calendar'] : tab.id === 'next-three-months' ? ['List','Roadmap'] : [];
  const filterOptions = definition ? [...definition.categories,...definition.statuses,...(['logistics','development'].includes(kind)?priorities:[])] : [];
  const today = singaporeToday();
  const firstDate = tab.id.startsWith('next-') || today < period.start ? window.start : today > period.end ? period.end : today;
  return <>
    <div className="page-title"><div><div className="eyebrow">{tab.group}</div><h1>{tab.name}</h1><p>{tab.description}</p></div>
      <div className="date-tile"><CalendarDays size={20}/><div><span>{tab.id.startsWith('next-')?'Planning window':'Reporting window'}</span><strong>{dateLabel(window.start)} – {dateLabel(window.end)}</strong></div></div>
    </div>
    {tab.indicators.length>0 && <section className="indicator-grid" aria-label="Indicators">{tab.indicators.map((indicator,index)=>{
      const Icon=indicatorIcons[index];
      return <div className="indicator panel" key={indicator}><span className="indicator-icon"><Icon size={19}/></span><h2>{indicator}</h2><strong className="indicator-value" aria-label="Unavailable">—</strong><span className="muted">Unavailable</span></div>;
    })}</section>}
    <IntegratedReport tab={tab.id} periodId={period.id} centreId={centreId} centres={workspace.centres}/>
    {report.isPending ? <Loading/> : report.isError ? <Failure error={report.error}/> : <>
      {kind ? <section className="panel report-panel">
        <div className="panel-heading"><div><h2>{kind==='development' ? 'Developments' : kind==='logistics' ? 'Procurement requests' : kind==='training' ? 'Training records' : 'Practices and challenges'}</h2><p>{presenting?'':tab.id==='next-two-weeks'?'Routine programme sessions appear when flagged as management highlights.':'Browse records for the selected centres and dates.'}</p></div>
          {editable && !archived && <button className="primary" onClick={()=>setEdit(null)}><Plus size={17}/> Add {definition.item}</button>}
        </div>
        {!presenting && <div className="toolbar"><label className="search"><Search size={17}/><input aria-label="Search reporting records" placeholder="Search records" maxLength={160} value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}}/></label>
          <select aria-label="Filter records" value={filter} onChange={event=>{setFilter(event.target.value);setPage(1);}}><option value="">All categories and statuses</option>{filterOptions.map(option=><option key={option}>{option}</option>)}</select>
          <label className="checkbox"><input type="checkbox" checked={archived} onChange={event=>{setArchived(event.target.checked);setPage(1);}}/> Archived</label>
          {!!viewOptions.length && <select aria-label="Record view" value={view} onChange={event=>setView(event.target.value)}>{viewOptions.map(option=><option key={option}>{option}</option>)}</select>}
        </div>}
        {!visible.length ? <Empty title={archived&&!presenting?'No archived records':'No records to display'}>{search||filter?'Clear your filters to see more records.':'Records for this centre and date range will appear here.'}</Empty>
          : view==='Status board' ? <div className="status-board">{definition.statuses.map(status=><div key={status}><h3>{status}</h3>{visible.filter(row=>row.status===status).map(row=><EntryCard key={row.id} row={row} centres={workspace.centres} editable={editable} edit={setEdit} archive={setArchive}/>)}</div>)}</div>
          : view==='Calendar' ? <div className="calendar-grid">{Array.from({length:14},(_,index)=>addDays(window.start,index)).map(day=><div key={day}><strong>{dateLabel(day)}</strong>{visible.filter(row=>row.date===day).map(row=><EntryCard key={row.id} row={row} centres={workspace.centres} editable={editable} edit={setEdit} archive={setArchive}/>)}</div>)}</div>
          : view==='Roadmap' ? <div className="roadmap">{visible.map(row=>{
            const length = (Date.parse(window.end)-Date.parse(window.start))/86400000+1;
            const from = Math.max(0,(Date.parse(row.date)-Date.parse(window.start))/86400000);
            const through = Math.min(length,(Date.parse(row.dueDate||row.date)-Date.parse(window.start))/86400000+1);
            return <div key={row.id}><EntryCard row={row} centres={workspace.centres} editable={editable} edit={setEdit} archive={setArchive}/><div className="roadmap-track" aria-label={'Scheduled '+dateLabel(row.date)+' through '+dateLabel(row.dueDate||row.date)}><span style={{marginInlineStart:from/length*100+'%',width:Math.max(1,through-from)/length*100+'%'}}/></div></div>;
          })}</div>:<div className="entry-list">{visible.map(row=><EntryCard key={row.id} row={row} centres={workspace.centres} editable={editable} edit={setEdit} archive={setArchive}/>)}</div>}
      </section> : integration.key&&activityHubTabs.includes(tab.id)?null:<section className="panel report-panel"><div className="panel-heading"><div><h2>Reporting data</h2><p>Figures will appear once an approved reporting dataset is connected.</p></div><Badge>Source pending</Badge></div>
        <Empty title="No reporting data available">Use the reporting conclusion below to record verified observations for this meeting.</Empty>
      </section>}
      <section className="panel report-panel">
        <div className="panel-heading"><div><h2>Reporting conclusion</h2><p>Record an update for information or raise an observation for discussion and action.</p></div>
        {editable && <button onClick={()=>setAddingConclusion(true)}><Plus size={17}/> Add conclusion</button>}</div>
        {report.data.conclusions.length ? <div className="entry-list">{report.data.conclusions.map(row=><EntryCard key={row.id} row={row} centres={workspace.centres} editable={false}/>)}</div> : <Empty title="No conclusions for this selection"/>}
        <PageControls page={page} more={report.data.hasMore} onChange={setPage}/>
      </section>
    </>}
    {edit!==undefined && <Modal title={edit?'Edit '+definition.item:'Add '+definition.item} close={()=>setEdit(undefined)}>
      <EntryForm row={edit} kind={kind} centres={writableCentres} period={period} firstDate={firstDate} onDone={()=>{setEdit(undefined);refresh('Record saved');}}/>
    </Modal>}
    {archive && <Modal title={archive.archived?'Restore record':'Archive record'} close={()=>setArchive(null)}>
      <p>{archive.title}</p><SaveForm label={archive.archived?'Restore':'Archive'} onSave={()=>api('/entries/'+archive.id,'PATCH',{archived:!archive.archived})} onDone={()=>{setArchive(null);refresh(archive.archived?'Record restored':'Record archived');}}><p className="wide">Archived records are available through the Archived filter.</p></SaveForm>
    </Modal>}
    {addingConclusion && <Modal title="Add reporting conclusion" close={()=>setAddingConclusion(false)}>
      <ConclusionForm tab={tab} centres={writableCentres} period={period} onDone={()=>{setAddingConclusion(false);refresh('Conclusion saved');}}/>
    </Modal>}
  </>;
}

function EntryCard({row,centres,editable,edit,archive}:{row:Entry;centres:Centre[];editable:boolean;edit?:(row:Entry)=>void;archive?:(row:Entry)=>void}) {
  const overdue = row.kind==='logistics' && row.dueDate && row.dueDate<singaporeToday() && !['Completed','Rejected'].includes(row.status);
  const labels:Record<string,string> = {summary:'Summary',observation:'Key observation',evidence:'Supporting evidence',implications:'Implications',recommendation:'Recommended action',owner:'Responsible person',dueDate:'Due date',priority:'Priority'};
  for (const field of modules[row.kind]?.fields ?? []) labels[field.key]=field.label;
  return <article className="entry-card"><div className="entry-heading"><div>
    <div className="entry-meta">{centres.find(centre=>centre.id===row.centreId)?.name} · {dateLabel(row.date)}{row.kind!=='conclusion' && ' · '+row.category}</div><h3>{row.title}</h3></div>
    <div className="entry-status">{overdue && <Badge tone="red">Overdue</Badge>}{row.kind!=='conclusion' && <Badge tone={['Good practice','Completed','Approved'].includes(row.status)?'green':'neutral'}>{row.status}</Badge>}</div></div>
    {row.dueDate && row.kind!=='conclusion' && <p className="muted">Due {dateLabel(row.dueDate)}</p>}
    {row.details.description && <p>{row.details.description}</p>}
    <dl className="details">{Object.entries(row.details).filter(([key,item])=>key!=='description' && Boolean(item)).map(([key,item])=>
      <div key={key}><dt>{key==='highlight'?'Management highlight':labels[key]??key}</dt><dd>{key==='document'?<a href={String(item)} target="_blank" rel="noreferrer">Open document</a>:typeof item==='boolean'?'Yes':String(item)}</dd></div>)}</dl>
    {editable && centres.some(centre=>centre.id===row.centreId&&centre.active) && <div className="entry-buttons">{!row.archived && <button onClick={()=>edit?.(row)}>Edit</button>}<button onClick={()=>archive?.(row)}>{row.archived?'Restore':'Archive'}</button></div>}
  </article>;
}

function EntryForm({row,kind,centres,period,firstDate,onDone}:{row:Entry|null;kind:string;centres:Centre[];period:Period;firstDate:string;onDone:()=>void}) {
  const definition=modules[kind];
  return <SaveForm onDone={onDone} onSave={data=>{
    const details:Record<string,string|boolean>=Object.fromEntries(definition.fields.map(field=>[field.key,value(data,field.key)]));
    if (kind==='development') details.highlight=data.has('highlight');
    if (kind==='development'||kind==='logistics') details.priority=value(data,'priority');
    return api(row?'/entries/'+row.id:'/entries',row?'PATCH':'POST',{
      centreId:row?.centreId??value(data,'centreId'),periodId:row?.periodId??period.id,kind,
      title:value(data,'title'),category:value(data,'category'),status:value(data,'status'),date:value(data,'date'),dueDate:value(data,'dueDate')||null,details
    });
  }}>
    <Field label="Title" wide><input name="title" required maxLength={160} defaultValue={row?.title}/></Field>
    <Field label="Centre"><select name="centreId" required disabled={!!row} defaultValue={row?.centreId??(centres.length===1?centres[0].id:'')}><option value="" disabled>Select a centre</option>{centres.map(centre=><option key={centre.id} value={centre.id}>{centre.name}</option>)}</select></Field>
    <Field label="Category"><select name="category" defaultValue={row?.category}>{definition.categories.map(category=><option key={category}>{category}</option>)}</select></Field>
    <Field label="Status"><select name="status" defaultValue={row?.status}>{definition.statuses.map(status=><option key={status}>{status}</option>)}</select></Field>
    <Field label={definition.date}><input name="date" type="date" required defaultValue={row?.date??firstDate}/></Field>
    <Field label={definition.due}><input name="dueDate" type="date" defaultValue={row?.dueDate??''}/></Field>
    {(kind==='development'||kind==='logistics') && <Field label="Priority"><select name="priority" defaultValue={String(row?.details.priority??'Normal')}>{priorities.map(priority=><option key={priority}>{priority}</option>)}</select></Field>}
    {definition.fields.map(field=><Field key={field.key} label={field.label} wide={!field.type&&field.key!=='owner'}>
      {field.type || field.key==='owner' ? <input name={field.key} required={field.required} type={field.type==='url'?'url':field.type==='date'?'date':'text'} inputMode={field.type==='money'?'decimal':field.type==='percent'||field.type==='quantity'?'numeric':undefined} defaultValue={String(row?.details[field.key]??'')}/>
        : <textarea name={field.key} required={field.required} maxLength={4000} defaultValue={String(row?.details[field.key]??'')}/>}
    </Field>)}
    {kind==='development' && <label className="checkbox wide"><input name="highlight" type="checkbox" defaultChecked={row?.details.highlight===true}/> Management highlight</label>}
  </SaveForm>;
}

function ConclusionForm({tab,centres,period,onDone}:{tab:Tab;centres:Centre[];period:Period;onDone:()=>void}) {
  const [type,setType]=useState('For information only');
  return <SaveForm onDone={onDone} onSave={data=>{
    const fields = type==='For information only'?['summary']:['observation','evidence','implications','recommendation','owner','dueDate','priority'];
    return api('/conclusions','POST',{centreId:value(data,'centreId'),periodId:period.id,tab:tab.id,type,...Object.fromEntries(fields.map(field=>[field,value(data,field)]))});
  }}>
    <Field label="Centre"><select name="centreId" required defaultValue={centres.length===1?centres[0].id:''}><option value="" disabled>Select a centre</option>{centres.map(centre=><option key={centre.id} value={centre.id}>{centre.name}</option>)}</select></Field>
    <Field label="Reporting type"><select value={type} onChange={event=>setType(event.target.value)}><option>For information only</option><option>Discussion and action required</option></select></Field>
    {type==='For information only'?<Field label="Summary" wide><textarea name="summary" required maxLength={4000}/></Field>:<>
      {Object.entries({observation:'Key observation',evidence:'Supporting evidence',implications:'Implications',recommendation:'Recommended action'}).map(([key,label])=><Field key={key} label={label} wide><textarea name={key} required maxLength={4000}/></Field>)}
      <Field label="Responsible person"><input name="owner" required maxLength={160}/></Field>
      <Field label="Due date"><input name="dueDate" type="date" required/></Field>
      <Field label="Priority"><select name="priority" defaultValue="Normal">{priorities.map(priority=><option key={priority}>{priority}</option>)}</select></Field>
    </>}
  </SaveForm>;
}
