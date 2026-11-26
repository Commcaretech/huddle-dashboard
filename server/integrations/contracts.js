import { z } from 'zod';

export const sourceKeys = ['activityhub', 'attendance', 'caritahub', 'health', 'p3h', 'publicity', 'manpower', 'excel', 'csv'];
export const sourceRegistry = [
  { key:'activityhub', name:'ActivityHub', datasets:['Programme series', 'Scheduled occurrences'], type:'Read-only API' },
  { key:'attendance', name:'Attendance dashboards', datasets:['Attendance entries', 'Aggregate participation'], type:'API or view' },
  { key:'caritahub', name:'CaritaHub', datasets:['Approved aggregate exports'], type:'File' },
  { key:'health', name:'Health assessment dashboard', datasets:['Assessment counts', 'Aggregate coverage'], type:'API or view' },
  { key:'p3h', name:'P3H Dashboard', datasets:['Approved aggregate programme and survey reporting'], type:'API or view' },
  { key:'publicity', name:'Publicity dashboard', datasets:['Platform metrics', 'Approved post references'], type:'API' },
  { key:'manpower', name:'Staff out-of-office tracker', datasets:['Availability summaries'], type:'API or view' },
  { key:'excel', name:'Excel', datasets:['Reviewed reporting imports'], type:'File' },
  { key:'csv', name:'CSV', datasets:['Reviewed reporting imports'], type:'File' }
];
const label = z.string().trim().min(1).max(160);
export const normalisedMetric = z.object({
  externalId: label, centreAlias: label, metricKey: label, periodStart: z.iso.date(), periodEnd: z.iso.date(),
  value: z.string().regex(/^-?\d{1,14}(\.\d{1,6})?$/), unit: label,
  dimensions: z.record(label, label), methodology: z.string().trim().min(1).max(2000),
  sourceUpdatedAt: z.iso.datetime({ offset: true }), schemaVersion: z.literal(1)
}).strict().refine(row => row.periodEnd >= row.periodStart, { path: ['periodEnd'], message:'End date precedes start date.' });

/**
 * Read-only adapter. The engine will own credentials, exact centre mapping, writes and history.
 * @typedef {{
 *  key: string,
 *  categories: readonly string[],
 *  testConnection: () => Promise<void>,
 *  fetchPage: (input: {cursor?: string, updatedSince?: string}) =>
 *    Promise<{rows: unknown[], nextCursor?: string}>,
 *  transform: (row: unknown) => z.infer<typeof normalisedMetric>
 * }} SourceAdapter
 */
