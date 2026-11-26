import { cloneElement, useEffect, useId, useRef, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { CircleAlert, ClipboardList, X } from 'lucide-react';

export function Empty({title,children}:{title:string;children?:ReactNode}) {
  return <div className="empty"><span className="empty-icon"><ClipboardList size={22}/></span><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}
export function Failure({error}:{error:unknown}) {
  return error ? <div className="failure" role="alert"><CircleAlert size={17}/>{error instanceof Error ? error.message : String(error)}</div> : null;
}
export function Loading() {
  return <div className="loading" role="status" aria-label="Loading"><div/><div/><div/></div>;
}
export function Badge({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'green'|'amber'|'red'}) {
  return <span className={'badge '+tone}>{children}</span>;
}
export function Field({label,children,wide=false}:{label:string;children:ReactElement<{id?:string;"aria-labelledby"?:string}>;wide?:boolean}) {
  const id = useId();
  return <label htmlFor={id} className={wide?'wide':undefined}><span id={id+'-label'}>{label}</span>{cloneElement(children,{id,'aria-labelledby':id+'-label'})}</label>;
}
export function Modal({title,children,close}:{title:string;children:ReactNode;close:()=>void}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog=ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  },[]);
  return <dialog ref={ref} onCancel={event=>{event.preventDefault();close();}} aria-labelledby="modal-title">
    <div className="modal-inner"><div className="panel-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={19}/></button></div>{children}</div>
  </dialog>;
}
export function SaveForm({children,onSave,onDone,label='Save'}:{children:ReactNode;onSave:(data:FormData)=>Promise<unknown>;onDone:()=>void;label?:string}) {
  const [pending,setPending]=useState(false);
  const [error,setError]=useState<unknown>();
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(undefined);
    try { await onSave(new FormData(event.currentTarget)); onDone(); }
    catch (failure) { setError(failure); }
    finally {setPending(false);}
  }
  return <form onSubmit={submit}><fieldset disabled={pending} className="form-grid">{children}</fieldset><Failure error={error}/><div className="form-footer"><button className="primary" disabled={pending}>{pending?'Saving…':label}</button></div></form>;
}
export function PageControls({page,more,onChange}:{page:number;more:boolean;onChange:(page:number)=>void}) {
  if (page === 1 && !more) return null;
  return <div className="page-controls"><button disabled={page===1} onClick={()=>onChange(page-1)}>Previous</button><span>Page {page}</span><button disabled={!more} onClick={()=>onChange(page+1)}>Next</button></div>;
}
export const value = (data:FormData,key:string) => String(data.get(key) ?? '');
