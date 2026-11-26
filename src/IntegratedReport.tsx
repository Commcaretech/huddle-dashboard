import { useQuery } from '@tanstack/react-query';
import { api,dateLabel,params,type Centre } from './api';
import { useIntegrationAccess } from './integration-access';
import { Badge,Empty,Failure,Loading } from './ui';

export const activityHubTabs=['kpi-performance','participant-profiles','fitness','hart','next-two-weeks','next-three-months'];
type IntegratedData={
  source:string; window:{start:string;end:string}; coverage:{centreId:string;syncedAt:string;stale:boolean}[];
  metrics:Record<string,number|null>|null; methodology:Record<string,string>; partial?:boolean; disabled?:boolean; truncated:boolean; unavailableReason?:string|null;
  programmes:{id:string;name:string;kind:string;domains:string[]}[];
  sessions:{id:string;name:string;status:string;sessionDate:string;startTime:string|null;endTime:string|null;plannedPax:number|null;
    venues:{name:string;capacity:number|null}[];hubCentreId:string}[];
};
export function IntegratedReport({tab,periodId,centreId,centres}:{tab:string;periodId:string;centreId:string;centres:Centre[]}) {
  const {key}=useIntegrationAccess();
  const query=useQuery({
    queryKey:['integrated-report',tab,periodId,centreId],
    enabled:!!key&&activityHubTabs.includes(tab),
    queryFn:()=>api<IntegratedData>('/integrations/report/'+tab+params({periodId,centreId}),'GET',undefined,key)
  });
  if(!key||!activityHubTabs.includes(tab)) return null;
  if(query.isPending) return <Loading/>;
  if(query.isError) return <Failure error={query.error}/>;
  const data=query.data;
  return <section className="panel report-panel">
    <div className="panel-heading"><div><h2>ActivityHub reporting</h2><p>{dateLabel(data.window.start)} to {dateLabel(data.window.end)}</p></div>
      <Badge>{data.metrics?'Synchronised':'Unavailable'}</Badge></div>
    {data.metrics===null?<Empty title={data.unavailableReason?'ActivityHub metric unavailable':'No ActivityHub snapshot covers this period'}>{data.unavailableReason??'Sync a date range covering this report for each mapped centre.'}</Empty>:<>
      <div className="settings-form">
        {data.partial&&<p><Badge tone="amber">Partial centre coverage</Badge> Figures only include the centres listed below.</p>}
        {data.coverage.map(item=><p key={item.centreId}>{centres.find(centre=>centre.id===item.centreId)?.name} · synced {new Intl.DateTimeFormat('en-SG',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Singapore'}).format(new Date(item.syncedAt))} · {item.stale?'Stale':'Current'}</p>)}
        <p>{tab==='fitness'?'Fitness uses ActivityHub Physical-domain classification. ':tab==='hart'?'Includes approved H.ART programme mappings. ':tab==='next-two-weeks'?'Includes flagged management highlights with future start times. ':''}
          Statuses reflect source records. Programme capacity and actual attendance are unavailable.</p>
        {data.disabled&&<p>The source is disabled. Showing the last saved snapshot.</p>}
      </div>
      <div className="table-wrap"><table><thead><tr><th>ActivityHub metric</th><th>Value</th><th>Definition</th></tr></thead>
        <tbody>{Object.entries(data.metrics).filter(([label])=>label!=='paxSessions').map(([label,value])=><tr key={label}>
          <td>{label}</td><td>{value??'Unavailable'}{label==='Planned pax'&&value!==null&&' ('+data.metrics?.paxSessions+' sessions)'}</td><td>{data.methodology[label]}</td>
        </tr>)}</tbody></table></div>
      {(tab==='participant-profiles'||tab==='next-three-months')&&<details className="settings-form"><summary>Programme catalogue</summary>
        {data.programmes.length?<ul>{data.programmes.map(row=><li key={row.id}>{row.name} · {row.kind} · {row.domains.join(', ')}</li>)}</ul>:<p>No matching programmes.</p>}
      </details>}
      {tab!=='kpi-performance'&&<details className="settings-form" open><summary>Eligible sessions</summary>
        {data.sessions.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Programme</th><th>Centre</th><th>Status</th><th>Time</th><th>Planned pax</th><th>Venue capacity</th></tr></thead>
          <tbody>{data.sessions.map(row=><tr key={row.id}><td>{dateLabel(row.sessionDate)}</td><td>{row.name}</td><td>{centres.find(centre=>centre.id===row.hubCentreId)?.name}</td>
            <td>{row.status}</td><td>{row.startTime&&row.endTime?row.startTime+'–'+row.endTime:'Unavailable'}</td><td>{row.plannedPax??'Unavailable'}</td>
            <td>{row.venues.length?row.venues.map(venue=>venue.name+' ('+(venue.capacity??'unavailable')+')').join(', '):'Unavailable'}</td></tr>)}</tbody>
        </table></div>:<p>No sessions match this selection.</p>}
      </details>}
      {data.truncated&&<p className="settings-form">The detail lists show the first 100 records. Counts use the full matching set.</p>}
    </>}
  </section>;
}
