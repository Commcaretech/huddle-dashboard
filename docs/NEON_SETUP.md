# Neon setup

In the Neon Console, open your project and click **Connect**. Select the correct branch and database, select the owner role, and turn **Connection pooling** off. Copy the direct PostgreSQL URL, then run these commands from the project directory:

```powershell
npm.cmd ci
$env:DATABASE_URL_UNPOOLED = (Get-Clipboard -Raw).Trim()
$env:BOOTSTRAP_ORGANISATION = Read-Host 'Enter the organisation name for a new database'
npm.cmd run db:migrate
if ($LASTEXITCODE -eq 0) { npm.cmd run db:setup }
```

Expect `Migrations applied.` and `Shared workspace available.` The migration applies [0000_productive_robin_chapel.sql](../migrations/0000_productive_robin_chapel.sql) through the Drizzle journal. Setup reuses the organisation if exactly one already exists and preserves existing records. For a database containing multiple organisations, query `SELECT id, name FROM public.organisations;` in Neon SQL Editor, then set `$env:BOOTSTRAP_ORGANISATION_ID` to the intended ID before rerunning setup.

The shared workspace is used for all reads, writes and audit attribution. Keep the owner URL and bootstrap values on the workstation. Put the pooled runtime connection in Vercel as described below.

## Give the Vercel database login access

After running the migration, generate a database password in PowerShell:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))" | Set-Clipboard
```

In Neon, open **SQL Editor**, select the reporting branch and database, and run the following. Replace the placeholder with the generated password and use your own database name in the `GRANT CONNECT` statement if it differs from `neondb`.

```sql
CREATE ROLE huddle_app LOGIN PASSWORD 'PASTE_GENERATED_PASSWORD_HERE';

GRANT CONNECT ON DATABASE neondb TO huddle_app;
GRANT USAGE ON SCHEMA public TO huddle_app;

GRANT SELECT ON
  public.organisations, public.application_settings, public.centres,
  public.user_profiles, public.user_centre_permissions, public.reporting_periods,
  public.report_entries, public.action_items, public.action_history,
  public.integration_sources, public.centre_aliases, public.sync_jobs
TO huddle_app;

GRANT INSERT ON
  public.application_settings, public.centres, public.user_profiles,
  public.user_centre_permissions, public.reporting_periods, public.report_entries,
  public.action_items, public.action_history, public.integration_sources,
  public.centre_aliases, public.audit_logs
TO huddle_app;

GRANT UPDATE ON
  public.organisations, public.application_settings, public.centres,
  public.user_profiles, public.report_entries, public.action_items
TO huddle_app;

GRANT DELETE ON public.user_centre_permissions, public.centre_aliases TO huddle_app;
```

In **Connect**, select the **huddle_app** role and turn **Connection pooling** on. Copy the full URL into Vercel's **DATABASE_URL**. If the URL contains a password placeholder, replace it with the password you just generated.
