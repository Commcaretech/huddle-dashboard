import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api,dateLabel,params} from './api';
import {useIntegrationAccess} from './integration-access';
import type {MetricDefinition} from './IntegrationSources';
import {Badge,Empty,Failure,Loading} from './ui';

export const glowReportTabs=['kpi-performance','participant-profiles','health-data','fitness','hart'];
type Range={from:string;to:string};
type Band={label?:string;value?:number;sourceDefinition?:string;score?:number;people?:number};
type Metric={value:number|Band[]|null;unit:string;status:'available'|'missing'|'suppressed';numerator?:number|null;denominator?:number|null};
type Cells=Record<string,Metric>;
type Row={id:string;name?:string;rank?:number;primaryDomain?:string;domains?:string[];subdomains?:string[];period?:string;partial?:boolean;
  from?:string;to?:string;source?:string;metric?:string;programme?:string|null;metrics:Cells;previous?:Cells|null;reportedMonths?:number;selectedMonths?:number;
  monthly?:{month:string;metrics?:Cells;reportedTotal?:Metric;final?:boolean|null}[];linked?:Cells;linkedMonthly?:{month:string;records:number}[]|null};
type Dataset={key:string;meta:{dataset:string;classification?:string;status?:string;coverageStatus?:string;period:Range;metrics?:Cells;
  previous?:Range&{metrics:Cells};dataLastUpdatedAt?:string|null};rows:Row[];definitions:MetricDefinition[];truncated:boolean};
type Report={
  source:string;centreName:string;window:{start:string;end:string};partial:boolean;datasets:Dataset[];reason?:string;stale?:boolean;disabled?:boolean;syncedAt?:string;
};
const labels:Record<string,string>={
  summary:'Period performance','summary:year-ago':'Same dates one year earlier','summary:ytd':'Year to date','summary:ytd-ago':'Equivalent year to date one year earlier',
  kpis:'Saved KPI targets and attainment',attendance:'Attendance and retention',membership:'Membership registry',demographics:'Demographic distributions',
  programmes:'Programme rankings',fitness:'Fitness participation','fitness:gym-tonic':'Gym Tonic participation',hart:'H.ART participation',
  'hart:approved-programmes':'Hub-approved H.ART programmes','health-assessments':'SPPB and Tanita','trends:month':'Monthly trends',
  'trends:quarter':'Quarterly trends','trends:year':'Annual trends'
};
const fmt=new Intl.NumberFormat('en-SG',{maximumFractionDigits:2});
const metricValue=(cell?:Metric)=>cell?.status==='suppressed'?'Suppressed':typeof cell?.value==='number'?fmt.format(cell.value)+' '+(cell.unit==='percent'?'%':cell.unit):'Unavailable';
const dateTime=(date:string)=>new Intl.DateTimeFormat('en-SG',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Singapore'}).format(new Date(date));
const titleFor=(defs:MetricDefinition[],id:string)=>defs.find(item=>item.id===id)?.displayName??id;

export function IntegratedReport({tab,periodId,centreId}:{tab:string;periodId:string;centreId:string}) {
  const {key}=useIntegrationAccess();
  const query=useQuery({queryKey:['integrated-report',tab,periodId,centreId],enabled:!!key&&glowReportTabs.includes(tab),
    queryFn:()=>api<Report>('/integrations/report/'+tab+params({periodId,centreId}),'GET',undefined,key)});
  if(!key||!glowReportTabs.includes(tab))return null;
  if(query.isPending)return <Loading/>;
  if(query.isError)return <Failure error={query.error}/>;
  const data=query.data;
  return <>
    {!!data.datasets.length&&<SourceCards tab={tab} report={data}/>}
    <section className="panel report-panel">
    <div className="panel-heading"><div><h2>GlowBBDashboard reporting</h2><p>{data.centreName} · {dateLabel(data.window.start)} to {dateLabel(data.window.end)}</p></div>
      <Badge tone={data.stale?'amber':'neutral'}>{data.syncedAt?(data.stale?'Stale snapshot':'Synchronised'):'Unavailable'}</Badge></div>
    <div className="settings-form">
      {data.partial&&<p>HQ coverage: GLOW Bukit Batok only.</p>}
      {data.syncedAt&&<p>Source: {data.source} · last synchronised {dateTime(data.syncedAt)}.</p>}
      {data.disabled&&<p>The source is disabled. Showing the last saved snapshot.</p>}
      {tab==='health-data'&&<p>MMSE, GT and LC are unavailable from the source. SPPB and Tanita reporting totals and screening activity counts are separate measures.</p>}
    </div>
    {!data.datasets.length?<Empty title="Source data unavailable">{data.reason}</Empty>:
      data.datasets.map((dataset,index)=><DatasetReport key={dataset.key} dataset={dataset} open={index===0}/>)}
  </section></>;
}
function SourceCards({tab,report}:{tab:string;report:Report}){
  const get=(key:string)=>report.datasets.find(dataset=>dataset.key===key);
  function from(key:string,id:string){
    const dataset=get(key);
    return {label:titleFor(dataset?.definitions??[],id),cell:dataset?.meta.metrics?.[id]};
  }
  const health=get('health-assessments')?.rows;
  const sppb=health?.find(row=>row.id==='SPPB');
  const tanita=health?.find(row=>row.id==='TANITA');
  const gym=get('fitness:gym-tonic')??(get('fitness')?.meta.classification==='Gym Tonic'?get('fitness'):undefined);
  const cards=tab==='kpi-performance'?[from('summary','programmes'),from('summary','sessions'),from('summary','unique'),from('summary','attendance')]:
    tab==='participant-profiles'?[from('membership','registered'),from('attendance','unique'),from('attendance','attendance'),from('attendance','repeat')]:
    tab==='health-data'?[{label:'Reported SPPB assessments',cell:sppb?.metrics.reportedTotal},{label:'SPPB assessment coverage',cell:sppb?.linked?.coverage},
      {label:'Reported Tanita assessments',cell:tanita?.metrics.reportedTotal}]:
    tab==='fitness'?[from('fitness','programmes'),from('fitness','sessions'),from('fitness','unique'),{label:'Gym Tonic attendance entries',cell:gym?.meta.metrics?.attendance}]:
    [from('hart','programmes'),from('hart','sessions'),from('hart','unique'),from('hart','attendance')];
  return <section className="indicator-grid" aria-label="GlowBBDashboard indicators">{cards.filter(card=>card.cell).map(card=>
    <div className="indicator panel" key={card.label}><h2>{card.label}</h2><strong className="indicator-value">{metricValue(card.cell)}</strong>
      <span className="muted">{report.source} · {report.centreName}</span>
      <span className="muted">{dateLabel(report.window.start)} to {dateLabel(report.window.end)}{report.syncedAt?' · '+dateTime(report.syncedAt):''}</span>
    </div>)}</section>;
}
function DatasetReport({dataset,open}:{dataset:Dataset;open:boolean}){
  const [chart,setChart]=useState(false);
  const [percent,setPercent]=useState(false);
  const [chartMetric,setChartMetric]=useState('attendance');
  const {key,meta,rows,definitions}=dataset;
  const ranked=rows.some(row=>row.rank!==undefined);
  const trend=key.startsWith('trends:');
  const health=key==='health-assessments';
  const selectable=definitions.filter(item=>rows.some(row=>typeof row.metrics[item.id]?.value==='number'));
  return <details className="settings-form" open={open}>
    <summary><strong>{labels[key]??key}{meta.classification?' · '+meta.classification:''}</strong></summary>
    {meta.period&&<p>{dateLabel(meta.period.from)} to {dateLabel(meta.period.to)}{meta.coverageStatus==='partial'?' · partial source coverage':''}</p>}
    {meta.dataLastUpdatedAt&&<p>Source updated {dateTime(meta.dataLastUpdatedAt)}</p>}
    {meta.status==='missing'||meta.coverageStatus==='missing'?<p>No observed source coverage for this selection.</p>:null}
    {(key==='demographics'||key==='attendance')&&<label className="checkbox"><input type="checkbox" checked={percent} onChange={event=>setPercent(event.target.checked)}/>Show share of released, non-overlapping bands</label>}
    {meta.metrics&&<MetricTable cells={meta.metrics} definitions={definitions} percent={percent} prior={meta.previous}/>}
    {(ranked||trend)&&!!selectable.length&&<div className="entry-buttons">
      <button type="button" onClick={()=>setChart(!chart)}>{chart?'Show table':'Show chart'}</button>
      {chart&&<select aria-label="Chart metric" value={selectable.some(item=>item.id===chartMetric)?chartMetric:selectable[0].id} onChange={event=>setChartMetric(event.target.value)}>
        {selectable.map(item=><option key={item.id} value={item.id}>{item.displayName}</option>)}</select>}
    </div>}
    {chart&&selectable.length>0?<MetricChart rows={rows} definition={selectable.find(item=>item.id===chartMetric)??selectable[0]}/>:
      health?rows.map(row=><HealthGroup key={row.id} row={row} definitions={definitions}/>):
      rows.length>0?<RowsTable rows={rows} definitions={definitions} ranked={ranked}/>:null}
    {dataset.truncated&&<p>Showing the first 150 detail rows for this dataset.</p>}
  </details>;
}
function MetricTable({cells,definitions,percent=false,prior}:{cells:Cells;definitions:MetricDefinition[];percent?:boolean;prior?:Range&{metrics:Cells}}){
  return <div className="table-wrap"><table><thead><tr><th>Metric</th><th>Value</th>{prior&&<th>Previous equivalent period · {dateLabel(prior.from)} to {dateLabel(prior.to)}</th>}<th>Definition</th></tr></thead>
    <tbody>{Object.entries(cells).map(([id,cell])=><tr key={id}><td>{titleFor(definitions,id)}</td>
      <td>{Array.isArray(cell.value)?<Distribution cell={cell} showShare={percent&&id!=='language'&&id!=='scoreDistribution'}/>:<>
        {metricValue(cell)}{cell.numerator!=null&&cell.denominator!=null&&<p>{fmt.format(cell.numerator)} / {fmt.format(cell.denominator)}</p>}</>}</td>
      {prior&&<td>{metricValue(prior.metrics[id])}</td>}<td>{definitions.find(item=>item.id===id)?.methodology??'Source-reported'}</td></tr>)}</tbody>
  </table></div>;
}
function Distribution({cell,showShare}:{cell:Metric;showShare:boolean}){
  const bands=Array.isArray(cell.value)?cell.value:[];
  const total=bands.reduce((sum,band)=>sum+(band.value??band.people??0),0);
  return bands.length?<ul>{bands.map((band,index)=>{
    const label=band.label??(band.sourceDefinition??'')+' '+String(band.score??'');
    const count=band.value??band.people??0;
    return <li key={label+index}>{label}: {showShare&&total?fmt.format(count/total*100)+'% of released bands':fmt.format(count)+' '+cell.unit}</li>;
  })}</ul>:<span>No released bands</span>;
}
function rowLabel(row:Row){
  return row.name??row.period??(row.metric?row.metric+' · '+row.source:row.id);
}
function RowsTable({rows,definitions,ranked}:{rows:Row[];definitions:MetricDefinition[];ranked:boolean}){
  const preferred=ranked?['attendance','unique','allAges','sessions']:['attendance','unique','sessions','actual','target','attainment'];
  const ids=[...new Set(rows.flatMap(row=>Object.keys(row.metrics)))];
  const shown=ids.filter(id=>preferred.includes(id));
  return <div className="table-wrap"><table><thead><tr><th>{ranked?'Programme':'Period or KPI scope'}</th>{shown.map(id=><th key={id}>{titleFor(definitions,id)}</th>)}</tr></thead>
    <tbody>{rows.map(row=><tr key={row.id}><td><strong>{row.rank?row.rank+'. ':''}{rowLabel(row)}</strong>
      {row.from&&row.to&&<p>{dateLabel(row.from)} to {dateLabel(row.to)}{row.partial?' · partial':''}</p>}
      {row.domains&&<p>{row.domains.join(', ')}{row.subdomains?.length?' · '+row.subdomains.join(', '):''}</p>}
      {row.programme&&!ranked&&<p>Programme scope: {row.programme}</p>}
      <details><summary>Metric details{row.monthly?.length?' and trends':''}</summary><MetricTable cells={row.metrics} definitions={definitions}/>
        {row.previous&&<><p>Previous equivalent period</p><MetricTable cells={row.previous} definitions={definitions}/></>}
        {row.monthly?.length?<ul>{row.monthly.map(month=><li key={month.month}>{month.month} · {metricValue(month.metrics?.attendance)}</li>)}</ul>:null}
      </details></td>{shown.map(id=><td key={id}>{metricValue(row.metrics[id])}</td>)}</tr>)}</tbody></table></div>;
}
function MetricChart({rows,definition}:{rows:Row[];definition:MetricDefinition}){
  const plotted=rows.filter(row=>typeof row.metrics[definition.id]?.value==='number').slice(0,30);
  const max=Math.max(1,...plotted.map(row=>Number(row.metrics[definition.id].value)));
  return <figure><figcaption>{definition.displayName} · {definition.unit} · up to 30 released rows</figcaption>
    {plotted.map(row=><div className="entry-buttons" key={row.id}><span>{rowLabel(row)}</span>
      <meter min={0} max={max} value={Number(row.metrics[definition.id].value)} aria-label={rowLabel(row)+' '+definition.displayName}/>
      <span>{metricValue(row.metrics[definition.id])}</span></div>)}</figure>;
}
function HealthGroup({row,definitions}:{row:Row;definitions:MetricDefinition[]}){
  return <section><h3>{row.id==='TANITA'?'Tanita':row.id}</h3>
    <p>Reported months: {row.reportedMonths??'Unavailable'} of {row.selectedMonths??'Unavailable'}.</p>
    <MetricTable cells={row.metrics} definitions={definitions}/>
    {!!row.monthly?.length&&<details><summary>Reported monthly assessment totals</summary><ul>{row.monthly.map(item=><li key={item.month}>{item.month} · {metricValue(item.reportedTotal)}{item.final?' · final':''}</li>)}</ul></details>}
    {row.linked&&Object.keys(row.linked).length>0&&<details open><summary>Approved linked SPPB aggregates</summary><MetricTable cells={row.linked} definitions={definitions}/></details>}
    {!!row.linkedMonthly?.length&&<details><summary>Approved linked SPPB trend</summary><ul>{row.linkedMonthly.map(item=><li key={item.month}>{item.month} · {item.records} records</li>)}</ul></details>}
  </section>;
}
