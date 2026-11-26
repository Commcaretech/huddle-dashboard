export const workspaceSubject = 'hub-open-workspace';

export class WorkspaceConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function postgresConfig(env) {
  if (env.HUB_MODE && env.HUB_MODE !== 'postgres') throw new WorkspaceConfigError('INVALID_HUB_MODE','Set HUB_MODE to postgres in Vercel Production.');
  if (!env.APP_URL?.trim()) throw new WorkspaceConfigError('MISSING_APP_URL','Set APP_URL to the HTTPS production domain in Vercel Production.');
  const url = URL.parse(env.APP_URL.trim());
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new WorkspaceConfigError('INVALID_APP_URL','APP_URL must be the HTTPS production domain with no page path.');
  }
  return { demo:false, actorSubject:workspaceSubject, allowedOrigins:[url.origin] };
}
