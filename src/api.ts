export type Centre = {id:string; name:string; code:string; active:boolean};
export type Period = {id:string; name:string; kind:string; start:string; end:string};
export type Role = 'hq_admin' | 'hq_viewer' | 'centre_manager' | 'centre_staff' | 'restricted_viewer';
export type Workspace = {
  organisation:string; settings:{logoUrl:string|null; fiscalStartMonth:number; fortnightAnchor:string};
  centres:Centre[]; periods:Period[]; user:{id:string; name:string; role:Role}; demo:boolean;
};
export type Entry = {
  id:string; centreId:string; periodId:string; kind:string; title:string; category:string;
  status:string; date:string; dueDate:string|null; details:Record<string,string|boolean>; archived:boolean;
};
export type Report = {window:{start:string;end:string}; rows:Entry[]; conclusions:Entry[]; hasMore:boolean};
export type Action = {
  id:string; centreId:string; periodId:string; description:string; tab:string; owner:string; dueDate:string;
  priority:string; status:string; progress:number; evidence:string; completedAt:string|null; createdAt:string;
  overdue:boolean; carriedForward:boolean; periodName:string;
};
export class ApiError extends Error {
  status:number;
  constructor(status:number,message:string) { super(message); this.status=status; }
}
export async function api<T>(path:string, method='GET', input?:unknown, operatorKey?:string):Promise<T> {
  const response = await fetch('/api' + path, {
    method, headers:{
      ...(method!=='GET'?{'Content-Type':'application/json'}:{}),
      ...(operatorKey?{'X-Integration-Operator-Key':operatorKey}:{})
    },
    ...(method!=='GET'?{body:JSON.stringify(input??{})}:{})
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status,value.error?.message || (typeof value.error === 'string' && value.error) || value.message || 'The request could not be completed.');
  return value as T;
}
export function params(values:Record<string,string|number|undefined>) {
  const result = new URLSearchParams();
  for (const [key,value] of Object.entries(values)) if (value !== undefined && value !== '') result.set(key,String(value));
  return '?' + result.toString();
}
export function dateLabel(date:string) {
  return new Intl.DateTimeFormat('en-SG',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Singapore'}).format(new Date(date));
}
export const canWrite = (role:Role) => ['hq_admin','centre_manager','centre_staff'].includes(role);
