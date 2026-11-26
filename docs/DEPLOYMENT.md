# Deploy to Vercel

1. Apply the migration and bootstrap the first administrator on the intended Neon branch from a trusted workstation. See [Neon setup](NEON_SETUP.md).
2. In the organisation's Vercel workspace, import the Git repository and select its root directory. Use the Vite framework preset and Node.js 24.x. The checked-in `vercel.json` sets the build command, output directory, Singapore function region (`sin1`), and routing.
3. In **Settings → Environment Variables**, set the following values for **Production**. Deploy after saving them.

| Variable | Value |
| --- | --- |
| `HUB_MODE` | `postgres` |
| `APP_URL` | The canonical HTTPS origin, for example `https://your-hub.vercel.app` |
| `DATABASE_URL` | The pooled Neon connection URL for the runtime role |
| `NEON_AUTH_BASE_URL` | The Managed Better Auth URL from the same Neon branch |
| `SESSION_SECRET` | A randomly generated secret of at least 32 characters |

4. Add the exact `APP_URL` to Neon Auth's trusted origins. Open that domain when signing in or making reporting edits.
5. After deploying, check `/api/healthz` for `{"ready":true}`, refresh a direct reporting link such as `/next-two-weeks`, and test sign-in, a scoped reporting write, and sign-out.

Vercel serves the Vite output and forwards same-origin API requests to a Node.js Function that runs the existing Express app. Neon owns persistent storage. Migrations and bootstrap run separately, so the direct database URL and bootstrap values belong on the administrative workstation. The local demo and its files stay on your computer.

For a hosted preview, use a separate Neon branch, preview credentials and a stable preview origin configured in both Vercel and Neon Auth. The write-origin check uses the configured `APP_URL`.

[Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite) · [Vercel Function database pooling](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)
