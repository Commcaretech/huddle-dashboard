# Deploy to Vercel

1. Open the intended Neon branch and set up the database from PowerShell. Follow [Neon setup](NEON_SETUP.md). If you previously set up the dashboard with individual accounts, rerun `npm.cmd run db:setup` after pulling the new code to register the shared workspace against the existing organisation.
2. In Vercel, click **Add New → Project** and import the GitHub repository. Use its root directory, the **Vite** preset and **Node.js 24.x**. The checked-in `vercel.json` sets the output directory and routing.
3. Open **Project → Settings → Environment Variables**. Add these values for **Production** and redeploy.

| Variable | Value |
| --- | --- |
| `HUB_MODE` | `postgres` |
| `APP_URL` | The exact HTTPS production origin from **Settings → Domains** |
| `DATABASE_URL` | The pooled Neon connection URL for the runtime role |

4. Wait for **Ready** in **Deployments**. Open your production domain followed by `/api/healthz`. The response should be `{"ready":true}`.
5. Open the homepage in a private window. The workspace opens directly. Click **Workspace settings** to add a centre and reporting period, then save and refresh a test entry.

The app uses a shared workspace identity. Anyone who can reach an unprotected deployment can read and edit records and change workspace settings. Use synthetic data on public deployments, or restrict access at the hosting or network layer before using real records. Keep the direct database URL on your administrative workstation.

[Vercel Vite deployment](https://vercel.com/docs/frameworks/frontend/vite) · [Vercel environment variables](https://vercel.com/docs/environment-variables)
