# Neon setup

Create the project in an organisation-owned Neon account. Use separate production and development branches with branch-specific Auth configuration. Use synthetic or explicitly approved de-identified data on development branches. Confirm identity settings separately after branching.

## Variables

| Setting | Use |
| --- | --- |
| `HUB_MODE=postgres` | Enables Neon-backed runtime and authentication |
| `DATABASE_URL` | Pooled PostgreSQL URL for the runtime role |
| `DATABASE_URL_UNPOOLED` | Direct PostgreSQL URL for migrations and bootstrap; use only on the administrative workstation |
| `APP_URL` | Canonical HTTPS origin |
| `NEON_AUTH_BASE_URL` | HTTPS Managed Better Auth branch URL copied from the Neon Console |
| `SESSION_SECRET` | Random secret of at least 32 characters for the Neon Auth proxy's session cookie |
| `BOOTSTRAP_ORGANISATION`, `BOOTSTRAP_ADMIN_SUBJECT`, `BOOTSTRAP_ADMIN_NAME` | Used only by the explicit bootstrap command |

Enable Managed Better Auth, configure email/password accounts and verification, set the application origin in the Neon Auth settings, and provision a verified administrator. Copy the user ID from Neon Auth. Use an approved SMTP/provider configuration if your environment needs it. Only an active matching reporting profile grants application access.

Confirm the branch and database identity from the administrative connection, then run:

```powershell
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run db:setup
```

The migration runner applies [0000_productive_robin_chapel.sql](../migrations/0000_productive_robin_chapel.sql) using Drizzle's tracked migration journal. Setup creates the organisation, calendar settings and administrator. Existing profiles with the same administrator subject are left intact. Run the commands on a test branch before applying to production.

Provision a distinct runtime role. Grant database connection and schema usage plus select and the required insert/update permissions on Hub tables. The runtime needs delete on `user_centre_permissions` and `centre_aliases` to replace profile grants and remove unused mappings. Give the runtime role no migration/schema ownership and no access to individual source records. Use the direct admin URL only for controlled setup and schema changes.

The Express adapter uses the official SDK's framework-agnostic request proxy and allowlists email sign-in, session verification and sign-out. The SDK handles the Auth cookies. No additional application login library or browser database SDK is required. Consult [Neon Auth](https://neon.com/docs/auth/quick-start/react) and the [SDK adapter reference](https://github.com/neondatabase/neon-js/blob/main/packages/auth/BUILDING-AN-ADAPTER.md).
