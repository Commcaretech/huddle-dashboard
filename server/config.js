export const workspaceSubject = 'hub-open-workspace';

export function postgresConfig(env) {
  if (env.HUB_MODE && env.HUB_MODE !== 'postgres') throw new Error('Hosted environments require PostgreSQL.');
  const url = URL.parse(env.APP_URL ?? '');
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('APP_URL must be a valid HTTPS origin.');
  }
  return { demo:false, actorSubject:workspaceSubject, allowedOrigins:[url.origin] };
}
