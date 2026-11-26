import { sql } from 'drizzle-orm';
import { pgTable, pgEnum, uuid, text, boolean, integer, date, timestamp, jsonb, numeric, unique, index, check, foreignKey } from 'drizzle-orm/pg-core';

const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();
export const role = pgEnum('app_role', ['hq_admin', 'hq_viewer', 'centre_manager', 'centre_staff', 'restricted_viewer']);

export const organisations = pgTable('organisations', {
  id: id(), name: text().notNull(), createdAt: createdAt()
});
export const settings = pgTable('application_settings', {
  orgId: uuid('org_id').primaryKey().references(() => organisations.id),
  logoUrl: text('logo_url'), fiscalStartMonth: integer('fiscal_start_month').default(4).notNull(),
  fortnightAnchor: date('fortnight_anchor').default('2026-01-05').notNull(), updatedAt: updatedAt()
}, t => [check('fiscal_month_range', sql`${t.fiscalStartMonth} between 1 and 12`)]);
export const centres = pgTable('centres', {
  id: id(), orgId: uuid('org_id').notNull().references(() => organisations.id),
  code: text().notNull(), name: text().notNull(), active: boolean().default(true).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [unique().on(t.orgId, t.code), unique().on(t.orgId, t.id)]);
export const users = pgTable('user_profiles', {
  id: id(), orgId: uuid('org_id').notNull().references(() => organisations.id),
  subject: text().notNull().unique(), name: text().notNull(), role: role().notNull(),
  active: boolean().default(true).notNull(), createdAt: createdAt(), updatedAt: updatedAt()
}, t => [unique().on(t.orgId, t.id)]);
export const grants = pgTable('user_centre_permissions', {
  orgId: uuid('org_id').notNull(), centreId: uuid('centre_id').notNull(), userId: uuid('user_id').notNull()
}, t => [
  unique().on(t.userId, t.centreId),
  foreignKey({ columns: [t.orgId, t.centreId], foreignColumns: [centres.orgId, centres.id] }),
  foreignKey({ columns: [t.orgId, t.userId], foreignColumns: [users.orgId, users.id] })
]);
export const periods = pgTable('reporting_periods', {
  id: id(), orgId: uuid('org_id').notNull().references(() => organisations.id),
  name: text().notNull(), kind: text().notNull(), start: date().notNull(), end: date().notNull(),
  createdAt: createdAt()
}, t => [unique().on(t.orgId, t.kind, t.start, t.end), unique().on(t.orgId, t.id), check('period_dates', sql`${t.end} >= ${t.start}`)]);
export const entries = pgTable('report_entries', {
  id: id(), orgId: uuid('org_id').notNull(), centreId: uuid('centre_id').notNull(), periodId: uuid('period_id').notNull(),
  kind: text().notNull(), title: text().notNull(), category: text().notNull(), status: text().notNull(),
  date: date().notNull(), dueDate: date('due_date'), details: jsonb().default({}).notNull(),
  archived: boolean().default(false).notNull(), createdAt: createdAt(), updatedAt: updatedAt()
}, t => [
  foreignKey({ columns: [t.orgId, t.centreId], foreignColumns: [centres.orgId, centres.id] }),
  foreignKey({ columns: [t.orgId, t.periodId], foreignColumns: [periods.orgId, periods.id] }),
  index().on(t.orgId, t.centreId, t.kind, t.date), index().on(t.orgId, t.periodId)
]);
export const actions = pgTable('action_items', {
  id: id(), orgId: uuid('org_id').notNull(), centreId: uuid('centre_id').notNull(), periodId: uuid('period_id').notNull(),
  conclusionId: uuid('conclusion_id').notNull().unique().references(() => entries.id),
  tab: text().notNull(), description: text().notNull(), owner: text().notNull(), dueDate: date('due_date').notNull(),
  priority: text().notNull(), status: text().default('Pending').notNull(),
  progress: integer().default(0).notNull(), evidence: text().default('').notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }), createdAt: createdAt(), updatedAt: updatedAt()
}, t => [
  foreignKey({ columns: [t.orgId, t.centreId], foreignColumns: [centres.orgId, centres.id] }),
  foreignKey({ columns: [t.orgId, t.periodId], foreignColumns: [periods.orgId, periods.id] }),
  check('progress_range', sql`${t.progress} between 0 and 100`), index().on(t.orgId, t.centreId, t.dueDate)
]);
export const actionHistory = pgTable('action_history', {
  id: id(), actionId: uuid('action_id').notNull().references(() => actions.id),
  actorId: uuid('actor_id').notNull().references(() => users.id), changes: jsonb().notNull(), createdAt: createdAt()
}, t => [index().on(t.actionId, t.createdAt)]);
export const sources = pgTable('integration_sources', {
  id: id(), orgId: uuid('org_id').notNull().references(() => organisations.id),
  key: text().notNull(), enabled: boolean().default(false).notNull(), createdAt: createdAt(), updatedAt: updatedAt()
}, t => [unique().on(t.orgId, t.key), unique().on(t.orgId, t.id)]);
export const aliases = pgTable('centre_aliases', {
  id: id(), orgId: uuid('org_id').notNull(), sourceId: uuid('source_id').notNull(),
  centreId: uuid('centre_id').notNull(), alias: text().notNull()
}, t => [
  unique().on(t.sourceId, t.alias),
  foreignKey({ columns: [t.orgId, t.centreId], foreignColumns: [centres.orgId, centres.id] }),
  foreignKey({ columns: [t.orgId, t.sourceId], foreignColumns: [sources.orgId, sources.id] })
]);
export const metrics = pgTable('normalised_metrics', {
  id: id(), orgId: uuid('org_id').notNull(), centreId: uuid('centre_id').notNull(),
  sourceId: uuid('source_id').notNull(), externalId: text('external_id').notNull(), metricKey: text('metric_key').notNull(),
  periodStart: date('period_start').notNull(), periodEnd: date('period_end').notNull(), value: numeric({ precision: 20, scale: 6 }).notNull(),
  unit: text().notNull(), dimensions: jsonb().notNull(), methodology: text().notNull(),
  sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }).notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(), schemaVersion: integer('schema_version').notNull()
}, t => [
  unique().on(t.sourceId, t.externalId),
  foreignKey({ columns: [t.orgId, t.centreId], foreignColumns: [centres.orgId, centres.id] }),
  foreignKey({ columns: [t.orgId, t.sourceId], foreignColumns: [sources.orgId, sources.id] }),
  index().on(t.orgId, t.centreId, t.metricKey, t.periodStart)
]);
export const syncJobs = pgTable('sync_jobs', {
  id: id(), sourceId: uuid('source_id').notNull().references(() => sources.id),
  status: text().notNull(), counts: jsonb().default({}).notNull(), errorSummary: text('error_summary'),
  finishedAt: timestamp('finished_at', { withTimezone: true }), createdAt: createdAt()
}, t => [index().on(t.sourceId, t.createdAt)]);
export const audit = pgTable('audit_logs', {
  id: id(), orgId: uuid('org_id').notNull().references(() => organisations.id),
  actorId: uuid('actor_id').notNull().references(() => users.id), event: text().notNull(),
  recordId: uuid('record_id').notNull(), createdAt: createdAt()
}, t => [index().on(t.orgId, t.createdAt)]);
