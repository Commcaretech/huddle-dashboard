# Run a GlowBBDashboard sync

1. Set up and deploy the source and Hub as described in [GlowBBDashboard integration](GLOWBB_INTEGRATION.md).
2. In the Hub header click **View data sources**. Enter your Hub operator key and click **Unlock integrations**.
3. Under **GlowBBDashboard controls**, click **Test connection**. Open **View available metrics** to see the discovered catalogue, methods and historical bounds.
4. Open **Centre mapping**. Select the active **GLOW Bukit Batok** Hub centre and click **Save mapping**. Click **Enable source**.
5. For an exact period, enter the **Start date** and **End date**. Both count. For the current reporting period, use today's Singapore date if the reporting period ends in the future. Click **Preview data** to review a bounded sample, then **Sync now**.
6. For a backfill, click **Sync historical data**. The job queues the source's full advertised approved range and the saved Hub periods wholly within that range. Each scope is fetched independently. Monthly, quarterly and yearly trends are requested from the source. Add a missing Hub period or sync its exact dates separately if needed.
7. If you leave the page, return to **Data sources**, unlock it again and click **Resume sync**. Review **View sync history** and **View errors**. Successful scopes are available before a longer backfill finishes.
8. Open a reporting tab with operator access. Select the matching date period and GLOW Bukit Batok, or select HQ and look for the single-centre coverage label.

**Sync all** runs the single active GlowBBDashboard adapter for the entered range. Manual sync uses one source page per Vercel invocation and one persisted active job per source. Upserts replace a complete exact scope in a transaction. Existing successful scopes and staff-entered reports survive failed jobs. If source data changes during pagination, the Hub checks totals, ranks, IDs and available source timestamps, and rejects inconsistent pages. The source has no snapshot token or incremental change feed, so the Hub refreshes exact scopes. On rate limits or transient failures, retry after the source recovers.

The source API accepts dates through today, a span of up to ten years, and paginated rankings. A Hub scope also has response and snapshot size bounds. Use shorter ranges if the source or Hub rejects a very large scope. Published scopes report last sync time, source freshness and available coverage. If the source fails, the most recent applicable snapshot remains available with a stale indicator.
