import { z } from 'zod';

export const sourceRegistry = [
  { key:'glowbb', name:'GlowBBDashboard', centre:'GLOW Bukit Batok', datasets:['Discover from source'], type:'Read-only API' },
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
 * Each read-only adapter owns authentication, scope validation and source-specific paging.
 * Source responses are validated and reduced to the fields approved for the Hub.
 * The publication service owns claims, persisted progress, exact centre mapping and history.
 *
 * @typedef {{centreId:string,from:string,to:string}} IntegrationScope
 * @typedef {{
 *   key:string, configured:boolean,
 *   test:() => Promise<object>,
 *   centres:() => Promise<object>,
 *   datasets:() => Promise<object>,
 *   get:(dataset:string,scope:IntegrationScope,options?:{cursor?:string,etag?:string,limit?:number}) => Promise<object>
 * }} SourceAdapter
 */
