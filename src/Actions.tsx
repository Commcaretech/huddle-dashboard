import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { actionStatuses, priorities, tabs } from '../shared/reporting';
import { api, canWrite, dateLabel, params, type Action, type Period, type Workspace } from './api';
import { Badge, Empty, Failure, Field, Loading, Modal, PageControls, SaveForm, value } from './ui';

type History = {id:string;createdAt:string;changes:{status:string;progress?:number;evidence?:string;event?:string}};
export function Actions({workspace,centreId,period,refresh}:{workspace:Workspace;centreId:string;period?:Period;refresh:(message:string)=>void}) {
  const [page,setPage]=useState(1);
  const [status,setStatus]=useState('Open actions');
  const [owner,setOwner]=useState('');
  const [priority,setPriority]=useState('');
  const [tab,setTab]=useState('');
  const [due,setDue]=useState('');
  const [edit,setEdit]=useState<Action|null>(null);
  const [history,setHistory]=useState<Action|null>(null);
  const query = useQuery({queryKey:['actions',centreId,period?.id,page,status,owner,priority,tab,due],queryFn:()=>api<{rows:Action[];hasMore:boolean}>(
    '/actions'+params({centreId,periodId:period?.id,page,status,owner,priority,tab,due})
  )});
  const records=query.data?.rows??[];
  const change=(setter:(value:string)=>void)=>(event:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>{setter(event.target.value);setPage(1);};
  return <>
    <div className="page-title"><div><div className="eyebrow">Meeting workspace</div><h1>Action tracker</h1><p>Follow up on decisions and unresolved actions across reporting periods.</p></div></div>
    <div className="panel report-panel"><div className="panel-heading"><div><h2>Meeting actions</h2><p>{period?'Includes unresolved actions from earlier reporting periods.':'Showing all reporting periods.'}</p></div></div>
      <div className="toolbar">
        <select aria-label="Action status" value={status} onChange={change(setStatus)}>{['Open actions','All actions',...actionStatuses].map(item=><option key={item}>{item}</option>)}</select>
        <input aria-label="Filter by owner" placeholder="Filter by owner" value={owner} onChange={change(setOwner)} maxLength={160}/>
        <select aria-label="Action priority" value={priority} onChange={change(setPriority)}><option value="">All priorities</option>{priorities.map(item=><option key={item}>{item}</option>)}</select>
        <select aria-label="Originating reporting tab" value={tab} onChange={change(setTab)}><option value="">All reporting tabs</option>{tabs.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <label className="inline-field">Due by <input aria-label="Due by" type="date" value={due} onChange={change(setDue)}/></label>
      </div>
      {query.isPending?<Loading/>:query.isError?<Failure error={query.error}/>:records.length?<div className="table-wrap"><table><thead><tr><th>Action</th><th>Owner</th><th>Due date</th><th>Priority</th><th>Status</th><th>Progress</th><th>Manage</th></tr></thead>
      <tbody>{records.map(row=><tr key={row.id}><td><strong>{row.description}</strong><p>{tabs.find(item=>item.id===row.tab)?.name} · {workspace.centres.find(item=>item.id===row.centreId)?.name} · {row.periodName}</p><p>Assigned {dateLabel(row.createdAt)}{row.completedAt?' · Completed '+dateLabel(row.completedAt):''}</p>{row.carriedForward&&<Badge tone="amber">Carried forward</Badge>}</td>
        <td>{row.owner}</td><td>{dateLabel(row.dueDate)}{row.overdue&&<div><Badge tone="red">Overdue</Badge></div>}</td><td>{row.priority}</td><td>{row.status}</td><td><progress value={row.progress} max={100} aria-label="Action progress"/> {row.progress}%</td>
        <td><div className="entry-buttons">{canWrite(workspace.user.role)&&workspace.centres.some(item=>item.id===row.centreId&&item.active)&&<button onClick={()=>setEdit(row)}>Update</button>}<button onClick={()=>setHistory(row)}>History</button></div></td>
      </tr>)}</tbody></table></div>:<Empty title="No actions match this selection">Actions are created when a reporting conclusion requires discussion and action.</Empty>}
      <PageControls page={page} more={query.data?.hasMore??false} onChange={setPage}/>
    </div>
    {edit && <Modal title="Update action" close={()=>setEdit(null)}><p>{edit.description}</p><ActionForm action={edit} canReopen={workspace.user.role!=='centre_staff'} done={()=>{setEdit(null);refresh('Action updated');}}/></Modal>}
    {history && <Modal title="Action history" close={()=>setHistory(null)}><p>{history.description}</p><HistoryList id={history.id}/></Modal>}
  </>;
}
function ActionForm({action,canReopen,done}:{action:Action;canReopen:boolean;done:()=>void}) {
  const [status,setStatus]=useState(action.status);
  const [progress,setProgress]=useState(action.progress);
  return <SaveForm onDone={done} onSave={data=>api('/actions/'+action.id,'PATCH',{status,progress,evidence:value(data,'evidence')})}>
    <Field label="Status"><select value={status} onChange={event=>{const next=event.target.value;setStatus(next);setProgress(next==='Completed'?100:Math.min(progress,99));}}>
      {actionStatuses.filter(item=>action.status!=='Completed'||canReopen||item==='Completed').map(item=><option key={item}>{item}</option>)}</select></Field>
    <Field label="Progress (%)"><input type="number" required min={0} max={status==='Completed'?100:99} disabled={status==='Completed'} value={progress} onChange={event=>setProgress(event.target.valueAsNumber)}/></Field>
    <Field label="Completion evidence" wide><textarea required={status==='Completed'} name="evidence" defaultValue={action.evidence} maxLength={4000}/></Field>
  </SaveForm>;
}
function HistoryList({id}:{id:string}) {
  const history=useQuery({queryKey:['history',id],queryFn:()=>api<History[]>('/actions/'+id+'/history')});
  if (history.isPending) return <Loading/>;
  if (history.isError) return <Failure error={history.error}/>;
  return <ul className="history">{history.data.map(event=><li key={event.id}><strong>{event.changes.event??event.changes.status}</strong> · {dateLabel(event.createdAt)}{event.changes.progress!==undefined&&' · '+event.changes.progress+'%'}{event.changes.evidence&&<p>{event.changes.evidence}</p>}</li>)}</ul>;
}
