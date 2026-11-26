# Connect ActivityHub to Management Hub

ActivityHub supplies approved schedule data through its Management Reporting API v1. The Hub fetches it server to server. Deploy the documented **management-reporting** Edge Function in the ActivityHub Supabase project before enabling the Hub source. See the ActivityHub repository's **docs/MANAGEMENT_HUB_API.md**, **docs/management-hub-api.openapi.json**, and **docs/MANAGEMENT_HUB_DATA_AUDIT.md**.

## 1. Apply the database upgrade

In the Neon Console, select the same project, branch and database as the Hub's Vercel runtime. Open **SQL Editor** as the database owner. If the base hub is new, run [neon-browser-setup.sql](neon-browser-setup.sql) first. After creating the runtime role, paste [neon-browser-integration-upgrade.sql](neon-browser-integration-upgrade.sql) into a new query and run it. Expect **Integration schema ready**. Change the runtime role name near the top only if Vercel connects as a role other than `huddle_app`. This script applies [0001_silent_aqueduct.sql](../migrations/0001_silent_aqueduct.sql), records it in Drizzle and grants runtime access.

On a workstation with the project and Node.js installed, the alternative migration command is `npm.cmd run db:migrate` with the direct owner URL in `DATABASE_URL_UNPOOLED`. Run the browser upgrade script afterward to apply its runtime grants. The script checks the migration journal before applying DDL. For a database set up by hand, the browser script checks that the base Hub tables and shared workspace exist, then creates the journal when needed and records the integration upgrade.

## 2. Set server environment variables

In Vercel open **Project → Settings → Environment Variables**. Add the following for **Production** and deploy the updated code.

| Variable | Value |
| --- | --- |
| `ACTIVITYHUB_API_URL` | `https://<activityhub-project-ref>.supabase.co/functions/v1/management-reporting/v1` |
| `ACTIVITYHUB_API_KEY` | The same dedicated 64-hex credential stored as `MANAGEMENT_HUB_API_KEY` in the ActivityHub Edge Function secrets |
| `INTEGRATION_OPERATOR_KEY` | A different random 64-character hexadecimal key, shared only with approved Hub operators |

Keep these outside `VITE_*` and source control. The Hub sends the ActivityHub key as **Authorization: Bearer** on HTTPS GETs. The separate operator key protects integration configuration, sync and imported reporting data alongside existing role and centre checks. The current workspace uses a shared identity. Operator access scopes to the server actor's allowed centres and provides no per-person audit attribution. Keep real operational data behind approved hosting or network access restrictions. Operator access remains in browser memory until locked or refreshed.

## 3. Test, map and sync

1. Open the Hub. Click **Workspace settings → Data sources** or **View data sources** in the header.
2. Enter the operator key and click **Unlock integrations**.
3. Click **Test connection**. Check the returned exact centre codes and open **Dataset definitions**.
4. Open **Centre mapping**. Select the ActivityHub code and matching Hub centre, then click **Save mapping**. One external code maps to one active Hub centre. Multiple ActivityHub codes cannot map to the same centre.
5. Select **Enable source**, a mapped centre, and inclusive start and end dates. Use a window covering the target report. For example, include the report's selected date range and its forward window when both need data.
6. Click **Preview available data** to inspect an eight-row sample. Use the programme classification form to mark approved H.ART programmes and management highlights. The marks are Hub-owned.
7. Click **Sync now** for the selected centre or **Sync all** for every active mapped centre in the entered date range. Reopen **Sync history and issues** to resume a pending scope. If ActivityHub responds with a snapshot change, start the scope again. If rate limited, wait one minute.
8. Open a connected reporting tab with the same operator access. Select a covered period and centre. Check source attribution, snapshot freshness, centre coverage and date range.

## Sync behaviour

Each request advances one bounded page. Neon stores progress, a per-job lease and completion history. A scope publishes transactionally only after every page of the catalogue, sessions, summary and upcoming datasets has completed. Cursors and totals must agree within a dataset. The canonical session scope requests all source statuses so cancellations remain visible.

Conditional requests use the previous successful ETag per dataset and exact scope. A 304 reuses its complete rows. A changed scope replaces the previous membership. This reconciles removals and corrections without treating removals as cancellations. Failed jobs retain the previous published data, flag stale coverage, and leave manual reporting tables untouched. A failed scope does not undo successful scopes. The browser advances scopes sequentially. A closed browser pauses the active job, which can be resumed. There is no scheduler.

A scope supports up to 366 days and 3,000 rows per dataset. Use a shorter range when needed. Forecast reports require a snapshot covering their complete selected dates. Overlapping scopes remain independent. The reporting view uses the latest successful covering scope per mapped centre.

## Onboard another source

Register its name, dataset availability and onboarding requirements. Implement an adapter after verifying the API or database view contract, plus fixtures for its response shape, stable IDs, paging, scope, errors and data retention rules. Use the existing source routes, snapshot publication and centre isolation rules where applicable. Get reporting owners to approve metric definitions and disclosure rules before exposing data on any tab.
