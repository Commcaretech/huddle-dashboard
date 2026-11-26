# Database schema

The [Drizzle schema](../server/db/schema.js) is the source for migrations. The first migration contains 14 tables.

| Tables | Role |
| --- | --- |
| organisations, application_settings | Tenant, branding, fiscal calendar and fortnight anchor |
| centres, user_profiles, user_centre_permissions | Centre registry and organisation/centre access |
| reporting_periods | Named period type and inclusive dates |
| report_entries | Practices, challenges, developments, training, logistics and conclusions |
| action_items, action_history | Action state, completion evidence and change history |
| integration_sources, centre_aliases, sync_jobs, normalised_metrics | Initial source, exact mapping, provenance, validated decimal metric and sync metadata |
| audit_logs | Actor, operation, record and transaction timestamp for administrative/reporting writes |

Structured narrative modules share common dates, centre, period and status. Validated module details live in JSONB. Monetary form fields retain decimal strings, with two fractional digits allowed, to avoid binary floating-point rounding. Move them to explicit numeric columns when SQL procurement totals are added. Normalised metric values already use numeric(20,6).

Composite foreign keys check organisation consistency for centre and period references. Source-scoped stable metrics and source alias keys are unique. Keep future schema changes additive and commit generated SQL and metadata. Use `npm run db:generate` after editing the schema. Reporting lifecycle, snapshots, KPI catalogue, imports, and dedicated analytical tables follow in later migrations.
