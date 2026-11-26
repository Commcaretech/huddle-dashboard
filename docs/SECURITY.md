# Security

- Organisational access and centre grants are validated on the backend. Writes also require an active centre and an editor role.
- Neon Auth validates identity using an HTTPS proxy. The application requires a verified email and active profile, checks write origins, limits JSON requests and rate-limits API and auth traffic.
- Drizzle parameterises data queries. Restrict runtime database privileges to Hub tables. Protect the migration and Neon Auth administration roles separately.
- Avoid participant identifiers, raw assessment results, private leave reasons and other confidential details in free text. Use approved HTTPS document references with their own access controls.
- Keep Neon and Vercel settings, secrets, credentials and backup ownership within the organisation. Demo mode is loopback-only and blocked in hosted mode.
- Verify production cookies, identity access, error logging, storage and role isolation before onboarding staff. Hosted authentication and live data connections require environment-specific checks.
