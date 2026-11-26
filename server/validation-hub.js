import { z } from 'zod';
import { modules, tabs, periodKinds, priorities, actionStatuses } from '../shared/reporting.js';

export const uid = z.uuid();
export const short = z.string().trim().min(1).max(160);
const bodyText = z.string().trim().max(4000);
export const https = z.string().trim().max(2048).url().refine(value => new URL(value).protocol === 'https:', 'Enter an HTTPS URL.');
export const selection = z.object({ centreId:uid.optional(), periodId:uid.optional() });
export const centreInput = z.object({ name:short, code:z.string().trim().regex(/^[A-Z0-9_-]{2,32}$/), active:z.boolean().default(true) }).strict();
export const periodInput = z.object({ name:short, kind:z.enum(periodKinds), start:z.iso.date(), end:z.iso.date() }).strict()
  .refine(p => p.end >= p.start, {path:['end'],message:'End date must be on or after the start date.'});
export const settingsInput = z.object({ name:short, logoUrl:https.nullable(), fiscalStartMonth:z.number().int().min(1).max(12), fortnightAnchor:z.iso.date() }).strict();
export const entryInput = z.object({
  centreId:uid, periodId:uid, kind:z.enum(['practice','development','training','logistics']),
  title:short, category:short, status:short, date:z.iso.date(), dueDate:z.iso.date().nullable(),
  details:z.record(z.string(),z.union([bodyText,z.boolean()]))
}).strict().superRefine((row,ctx) => {
  const definition = modules[row.kind];
  function issue(field, message) { ctx.addIssue({code:'custom',path:[field],message}); }
  if (!definition.categories.includes(row.category)) issue('category','Choose a supported category.');
  if (!definition.statuses.includes(row.status)) issue('status','Choose a supported status.');
  if (row.dueDate && row.dueDate < row.date) issue('dueDate','Due date must be on or after the event date.');
  const rules = {money:/^\d{1,12}(\.\d{1,2})?$/,quantity:/^[1-9]\d{0,6}$/,percent:/^(100|[1-9]?\d)$/};
  for (const field of definition.fields) {
    const value = row.details[field.key] ?? '';
    if (typeof value !== 'string' || (field.required && !value)) issue(field.key, field.label + ' is required.');
    else if (value && field.type === 'url' && !https.safeParse(value).success) issue(field.key, 'Enter an HTTPS link.');
    else if (value && field.type === 'date' && !z.iso.date().safeParse(value).success) issue(field.key, 'Enter a valid date.');
    else if (value && rules[field.type] && !rules[field.type].test(value)) issue(field.key, 'Enter a valid ' + field.label.toLowerCase() + '.');
  }
  const allowed = new Set(definition.fields.map(field => field.key));
  if (row.kind === 'development') allowed.add('highlight');
  if (row.kind === 'development' || row.kind === 'logistics') allowed.add('priority');
  for (const key of Object.keys(row.details)) if (!allowed.has(key)) issue(key,'Unsupported field.');
  if (row.details.highlight !== undefined && typeof row.details.highlight !== 'boolean') issue('highlight','Use a checkbox.');
  if (row.details.priority !== undefined && !z.enum(priorities).safeParse(row.details.priority).success) issue('priority','Select a priority.');
});
const conclusionBase = z.object({ centreId:uid, periodId:uid, tab:z.enum(tabs.map(tab => tab.id)) });
export const conclusionInput = z.discriminatedUnion('type', [
  conclusionBase.extend({ type:z.literal('For information only'), summary:bodyText.min(1) }).strict(),
  conclusionBase.extend({
    type:z.literal('Discussion and action required'), observation:bodyText.min(1), evidence:bodyText.min(1), implications:bodyText.min(1),
    recommendation:bodyText.min(1), owner:short, dueDate:z.iso.date(), priority:z.enum(priorities)
  }).strict()
]);
export const actionUpdate = z.object({ status:z.enum(actionStatuses), progress:z.number().int().min(0).max(100), evidence:bodyText }).strict()
  .refine(row => row.status === 'Completed' ? row.progress === 100 && !!row.evidence : row.progress < 100, {
    path:['progress'], message:'Completion requires 100% progress and evidence. Open actions must be below 100%.'
  });
