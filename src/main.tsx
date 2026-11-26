import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowLeft, ArrowRight, BarChart3, CalendarDays, ClipboardCheck, ClipboardList, Database, Dumbbell, GraduationCap, HeartPulse, LayoutDashboard, Menu, Moon, Package, Palette, PanelLeftClose, Presentation, Radio, Settings, Sun, Users, X } from 'lucide-react';
import { fiscalYear, singaporeToday, tabs } from '../shared/reporting.js';
import { api, dateLabel, type Workspace } from './api';
import { Actions } from './Actions';
import { Admin } from './Admin';
import { Reporting } from './Reporting';
import { Badge, Empty, Failure, Field, Loading } from './ui';
import './styles.css';
import { IntegrationAccessProvider } from './integration-access';

const icons=[BarChart3,ClipboardCheck,Activity,Users,HeartPulse,Dumbbell,Palette,Radio,Users,GraduationCap,Package,CalendarDays,LayoutDashboard];
const groups=['Performance','Programmes','Operations','Planning'];
const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:20000,refetchOnWindowFocus:false}}});
function App() {
  const [dark,setDark]=useState(()=>localStorage.getItem('hub-theme')==='dark');
  const workspace=useQuery({queryKey:['workspace'],queryFn:()=>api<Workspace>('/workspace')});
  useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';localStorage.setItem('hub-theme',dark?'dark':'light');},[dark]);
  return <WorkspaceShell workspace={workspace.isSuccess ? workspace.data : undefined}
    loadingWorkspace={workspace.isPending} workspaceError={workspace.error} retryWorkspace={()=>void workspace.refetch()}
    dark={dark} toggleTheme={()=>setDark(!dark)}/>;
}
function useRoute() {
  const read=()=>window.location.pathname.replace(/^\/+|\/+$/g,'')||tabs[0].id;
  const [route,setRoute]=useState(read);
  useEffect(()=>{const update=()=>setRoute(read());window.addEventListener('popstate',update);return ()=>window.removeEventListener('popstate',update);},[]);
  return {route,go:(path:string)=>{if(path!==route){window.history.pushState(null,'','/'+path);setRoute(path);window.scrollTo(0,0);}}};
}
function WorkspaceShell({workspace,loadingWorkspace,workspaceError,retryWorkspace,dark,toggleTheme}:{
  workspace?:Workspace;loadingWorkspace:boolean;workspaceError:unknown;retryWorkspace:()=>void;
  dark:boolean;toggleTheme:()=>void;
}) {
  const {route,go}=useRoute();
  const queryClient=useQueryClient();
  const [collapsed,setCollapsed]=useState(false);
  const [mobile,setMobile]=useState(false);
  const [centre,setCentre]=useState('');
  const [year,setYear]=useState('');
  const [periodId,setPeriodId]=useState('');
  const [presenting,setPresenting]=useState(false);
  const [toast,setToast]=useState('');
  const [sourceStatus,setSourceStatus]=useState(false);
  const index=Math.max(0,tabs.findIndex(item=>item.id===route));
  const tab=tabs[index];
  const admin=workspace?.user.role==='hq_admin';
  const allCentres=workspace?.centres??[];
  const allPeriods=workspace?.periods??[];
  const fiscalStart=workspace?.settings.fiscalStartMonth??4;
  const selectedCentre=allCentres.find(item=>item.id===centre);
  const centreId=selectedCentre?.id??'';
  const centreLabel=selectedCentre?.name??(workspace?.user.role.startsWith('hq_')?'Combined HQ':'All assigned centres');
  const years=[...new Set(allPeriods.map(item=>fiscalYear(item.start,fiscalStart)))].sort((a,b)=>b-a);
  const dates=allPeriods.filter(item=>!year||String(fiscalYear(item.start,fiscalStart))===year);
  const today=singaporeToday();
  const period=dates.find(item=>item.id===periodId)??dates.find(item=>item.start<=today&&item.end>=today)??dates[0];
  const isActions=route==='actions';
  const isSettings=admin&&(route==='settings'||route==='data-sources');
  function refresh(message:string) {
    setToast(message);
    void queryClient.invalidateQueries();
  }
  useEffect(()=>{if(!toast)return;const timeout=window.setTimeout(()=>setToast(''),3500);return ()=>window.clearTimeout(timeout);},[toast]);
  useEffect(()=>{
    if(!presenting)return;
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setPresenting(false);if(document.fullscreenElement)void document.exitFullscreen();}
      if(event.target instanceof HTMLElement && ['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)) return;
      if(event.key==='ArrowRight'&&index<tabs.length-1){event.preventDefault();go(tabs[index+1].id);}
      if(event.key==='ArrowLeft'&&index>0){event.preventDefault();go(tabs[index-1].id);}
    };
    const onFullScreen=()=>{if(!document.fullscreenElement)setPresenting(false);};
    window.addEventListener('keydown',onKey);
    document.addEventListener('fullscreenchange',onFullScreen);
    return ()=>{window.removeEventListener('keydown',onKey);document.removeEventListener('fullscreenchange',onFullScreen);};
  },[presenting,index,go]);
  function presentation() {
    if(presenting){setPresenting(false);if(document.fullscreenElement)void document.exitFullscreen();return;}
    if(isActions||isSettings)go(tabs[0].id);
    setPresenting(true);
    void document.documentElement.requestFullscreen?.().catch(()=>{});
  }
  const themeButton=<button className="icon-button" aria-label={dark?'Use light theme':'Use dark theme'} onClick={toggleTheme}>{dark?<Sun size={19}/>:<Moon size={19}/>}</button>;
  return <div className={'app '+(collapsed?'collapsed ':'')+(presenting?'presenting ':'')+(mobile?'mobile-open':'')}>
    {!presenting&&<>
      <button className="mobile-overlay" aria-label="Close navigation" onClick={()=>setMobile(false)}/>
      <aside className="sidebar">
        <div className="brand">{workspace?.settings.logoUrl?<img className="brand-mark" src={workspace.settings.logoUrl} alt=""/>:<span className="brand-mark"><HeartPulse size={22}/></span>}
          <div className="brand-name"><strong>{workspace?.organisation??'Community Care'}</strong><span>Management Hub</span></div>
          <button className="icon-button collapse-sidebar" title={collapsed?'Expand navigation':'Collapse navigation'} aria-label={collapsed?'Expand navigation':'Collapse navigation'} onClick={()=>setCollapsed(!collapsed)}><PanelLeftClose size={17}/></button></div>
        <nav aria-label="Reporting tabs">{groups.map(group=><div className="nav-group" key={group}><h2>{group}</h2>{tabs.map((item,i)=>{
          const Icon=icons[i];
          return item.group===group&&<a key={item.id} href={'/'+item.id} className={route===item.id||(!isActions&&!isSettings&&item.id===tab.id)?'active':''} aria-current={route===item.id||(!isActions&&!isSettings&&item.id===tab.id)?'page':undefined} title={collapsed?item.name:undefined} onClick={event=>{
            if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
            event.preventDefault();go(item.id);setMobile(false);
          }}><Icon size={18}/><span>{item.name}</span></a>;
        })}</div>)}</nav>
      </aside>
      <header className="header">
        <div className="topbar"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={()=>setMobile(true)}><Menu size={21}/></button>
          <div className="workspace-name">Management reporting</div>
          <div className="header-buttons">
            {workspace&&<>{admin?<button className="source-button" title="View data sources" aria-label="View data sources" onClick={()=>go('data-sources')}><Database size={15}/><span>Data sources</span></button>:<button className="source-button" onClick={()=>setSourceStatus(!sourceStatus)}><Database size={15}/><span>Data sources</span></button>}
            <button title="Outstanding actions" aria-label="Outstanding actions" onClick={()=>go('actions')}><ClipboardList size={16}/><span>Actions</span></button>
            <button title="Presentation mode" aria-label="Presentation mode" onClick={presentation} disabled={!period}><Presentation size={16}/><span>Present</span></button></>}
            {themeButton}
            {admin&&<button aria-label="Workspace settings" title="Workspace settings" onClick={()=>go('settings')}><Settings size={16}/><span>Settings</span></button>}
          </div>
          {sourceStatus&&<div className="account-menu"><p>Source configuration is available to workspace administrators.</p><button onClick={()=>setSourceStatus(false)}>Close</button></div>}
        </div>
        {workspace&&<div className="filters">
          <Field label="Centre"><select value={centreId} onChange={event=>setCentre(event.target.value)}><option value="">{workspace?.user.role.startsWith('hq_')?'Combined HQ':'All assigned centres'}</option>{allCentres.map(item=><option key={item.id} value={item.id}>{item.name}{!item.active?' (inactive)':''}</option>)}</select></Field>
          <Field label="Reporting period"><select value={period?.id??''} onChange={event=>setPeriodId(event.target.value)}>{!dates.length&&<option value="">No reporting periods</option>}{dates.map(item=><option key={item.id} value={item.id}>{item.name} · {dateLabel(item.start)} – {dateLabel(item.end)}</option>)}</select></Field>
          <Field label="Financial year"><select value={year} onChange={event=>{setYear(event.target.value);setPeriodId('');}}><option value="">All financial years</option>{years.map(item=><option key={item} value={item}>FY {item}/{String(item+1).slice(-2)}</option>)}</select></Field>
          {workspace?.demo&&<span className="demo-badge"><Badge tone="amber">Synthetic demo</Badge></span>}
        </div>}
      </header>
    </>}
    {presenting&&<header className="presentation-bar"><div><strong>{centreLabel}</strong>{period&&<span> · {dateLabel(period.start)} – {dateLabel(period.end)}</span>}</div><div>{workspace?.demo&&<Badge tone="amber">Synthetic demo</Badge>}<span>{index+1} / {tabs.length}</span>
      <button aria-label="Previous reporting tab" disabled={index===0} onClick={()=>go(tabs[index-1].id)}><ArrowLeft size={20}/></button>
      <button aria-label="Next reporting tab" disabled={index===tabs.length-1} onClick={()=>go(tabs[index+1].id)}><ArrowRight size={20}/></button>
      {themeButton}<button aria-label="Exit presentation" onClick={presentation}><X size={20}/></button></div></header>}
    <main id="main-content">
      {!workspace?<><div className="page-title"><div><div className="eyebrow">{isActions?'Meeting workspace':tab.group}</div><h1>{isActions?'Action tracker':tab.name}</h1></div></div>
        <section className="panel report-panel">
          {loadingWorkspace?<Loading/>:<><Failure error={workspaceError}/><button className="empty-button" onClick={retryWorkspace}>Retry</button></>}
        </section></>:isSettings&&!presenting?<Admin key={route} workspace={workspace} initial={route==='data-sources'?'Data sources':'Centres'} refresh={refresh}/>
      :isActions&&!presenting?<Actions key={centreId+(period?.id??'')} workspace={workspace} centreId={centreId} period={period} refresh={refresh}/>
      :period?<Reporting key={tab.id+centreId+period.id+String(presenting)} tab={tab} workspace={workspace} centreId={centreId} period={period} presenting={presenting} refresh={refresh}/>
      :<><div className="page-title"><div><div className="eyebrow">{tab.group}</div><h1>{tab.name}</h1></div></div><section className="panel report-panel">
        <Empty title="A reporting period is required">{admin?'Create a period in workspace settings.':'Ask an administrator to configure a reporting period.'}</Empty>{admin&&<button className="empty-button" onClick={()=>go('settings')}>Workspace settings</button>}</section></>}
    </main>
    {toast&&!presenting&&<div className="toast" role="status"><ClipboardCheck size={19}/>{toast}</div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><IntegrationAccessProvider><App/></IntegrationAccessProvider></QueryClientProvider>);
