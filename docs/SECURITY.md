# Security

- Anyone who can reach the deployment can read and edit reporting records and use Workspace settings. A public deployment is suitable for synthetic data. Restrict real-data deployments at the hosting or network layer.
- API requests use one configured organisation and a shared actor. Audit history identifies the shared actor rather than individual people.
- The server checks write origins, validates data, limits request size and rate-limits API calls. These controls do not establish visitor identity.
- Keep the Neon runtime and migration credentials private. Use a limited runtime role and keep the owner connection on the administrative workstation.
