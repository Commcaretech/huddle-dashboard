function httpsUrl(value, name, originOnly = false) {
  const url = URL.parse(value ?? '');
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (originOnly && url.pathname !== '/')) {
    throw new Error(name + ' must be a valid HTTPS ' + (originOnly ? 'origin.' : 'URL.'));
  }
  return url;
}

export function postgresConfig(env) {
  if (env.HUB_MODE && env.HUB_MODE !== 'postgres') throw new Error('Hosted environments require PostgreSQL and Neon Auth.');
  const appUrl = httpsUrl(env.APP_URL,'APP_URL',true).origin;
  const authUrl = httpsUrl(env.NEON_AUTH_BASE_URL,'NEON_AUTH_BASE_URL').href;
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');
  return { demo:false, appUrl, authUrl, secret, allowedOrigins:[appUrl] };
}
