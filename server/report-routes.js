import { Router } from 'express';
import { and, asc, desc, eq, gte, lte, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { actions, actionHistory, audit, entries, periods } from './db/schema.js';
import { canManage, canWrite, centreScope } from './permissions.js';
import { actionUpdate, conclusionInput, entryInput, selection, uid } from './validation-hub.js';
import { actionStatuses, dateWindow, priorities, singaporeToday, tabs } from '../shared/reporting.ts';

export class RequestError extends Error {
  constructor(status,message) { super(message); this.status = status; }
}
export function requireAccess(allowed) {
  if (!allowed) throw new RequestError(403,'You do not have permission for this operation.');
}
export const log = (tx,actor,event,recordId) => tx.insert(audit).values({orgId:actor.orgId,actorId:actor.id,event,recordId});

async function requirePeriod(db, actor, periodId) {
  const [period] = await db.select().from(periods).where(and(eq(periods.orgId,actor.orgId),eq(periods.id,periodId)));
  if (!period) throw new RequestError(404,'Reporting period was not found.');
  return period;
}
function requireActiveCentre(actor, centreId) {
  requireAccess(actor.centres.some(centre => centre.id === centreId && centre.active));
}
const resultLimit = 100;
const isArchived = z.enum(['true','false']).default('false').transform(value => value === 'true');
const pageQuery = selection.extend({ page:z.coerce.number().int().min(1).max(10000).default(1) });

export function reportRoutes(db) {
  const router = Router();
  router.get('/reports/:tab', async (req,res) => {
    const tab = tabs.find(item => item.id === req.params.tab);
    if (!tab) throw new RequestError(404,'Reporting tab was not found.');
    const {centreId,periodId,archived,page,search,filter} = pageQuery.extend({
      archived:isArchived, search:z.string().trim().max(160).optional(), filter:z.string().trim().max(160).optional()
    }).parse(req.query);
    if (!periodId) throw new RequestError(400,'Select a reporting period.');
    const period = await requirePeriod(db,req.actor,periodId);
    const window = dateWindow(tab.id,period);
    const scope = centreScope(req.actor,entries,centreId);
    const tabScope = and(scope,eq(entries.archived,archived));
    const kind = 'module' in tab ? tab.module : null;
    const mode = tab.id === 'recent-developments' ? 'recent' : tab.id === 'next-two-weeks' ? 'upcoming' : 'roadmap';
    let dateFilter = eq(entries.periodId,period.id);
    if (kind === 'development') {
      dateFilter = and(lte(entries.date,window.end), mode === 'roadmap'
        ? or(gte(entries.date,window.start),gte(entries.dueDate,window.start))
        : gte(entries.date,window.start));
    }
    if (kind === 'development' && mode === 'recent') {
      const outcomeDate = sql`${entries.details}->>'completedOn'`;
      dateFilter = or(dateFilter,and(eq(entries.status,'Completed'),gte(outcomeDate,window.start),lte(outcomeDate,window.end)));
    }
    const highlightFilter = mode === 'upcoming'
      ? or(ne(entries.category,'Programme'),sql`${entries.details}->>'highlight' = 'true'`)
      : undefined;
    const categoryFilter = filter
      ? or(eq(entries.category,filter),eq(entries.status,filter),sql`${entries.details}->>'priority' = ${filter}`)
      : undefined;
    const searchFilter = search ? sql`strpos(lower(concat_ws(' ',${entries.title},${entries.category},${entries.status},${entries.details}::text)),lower(${search})) > 0` : undefined;
    const [rows, conclusions] = await Promise.all([
      kind ? db.select().from(entries)
        .where(and(tabScope,eq(entries.kind,kind),dateFilter,highlightFilter,categoryFilter,searchFilter))
        .orderBy(mode === 'recent' ? desc(entries.date) : asc(entries.date),entries.id)
        .limit(resultLimit + 1).offset((page - 1) * resultLimit) : [],
      db.select().from(entries)
        .where(and(scope,eq(entries.archived,false),eq(entries.kind,'conclusion'),eq(entries.category,tab.id),eq(entries.periodId,period.id)))
        .orderBy(desc(entries.createdAt),entries.id).limit(resultLimit + 1).offset((page - 1) * resultLimit)
    ]);
    res.json({window, rows:rows.slice(0,resultLimit), conclusions:conclusions.slice(0,resultLimit),
      hasMore:rows.length > resultLimit || conclusions.length > resultLimit});
  });

  router.post('/entries', async (req,res) => {
    const actor = req.actor;
    requireAccess(canWrite(actor.role));
    const input = entryInput.parse(req.body);
    requireActiveCentre(actor,input.centreId);
    await requirePeriod(db,actor,input.periodId);
    const created = await db.transaction(async tx => {
      const [row] = await tx.insert(entries).values({...input,orgId:actor.orgId}).returning();
      await log(tx,actor,'entry.created',row.id);
      return row;
    });
    res.status(201).json(created);
  });

  router.patch('/entries/:id', async (req,res) => {
    const actor = req.actor;
    requireAccess(canWrite(actor.role));
    const id = uid.parse(req.params.id);
    const archive = req.body?.archived !== undefined;
    const input = archive ? z.object({archived:z.boolean()}).strict().parse(req.body) : entryInput.parse(req.body);
    const updated = await db.transaction(async tx => {
      const [row] = await tx.select().from(entries).where(and(centreScope(actor,entries),eq(entries.id,id))).for('update');
      if (!row || row.kind === 'conclusion') throw new RequestError(404,'Record was not found.');
      requireActiveCentre(actor,row.centreId);
      if (!archive && (row.archived || input.kind !== row.kind || input.centreId !== row.centreId || input.periodId !== row.periodId)) {
        throw new RequestError(409,'Restore archived records before editing. Centre, period and record type are fixed.');
      }
      const [saved] = await tx.update(entries).set({...input,updatedAt:new Date()}).where(eq(entries.id,id)).returning();
      await log(tx,actor,archive ? input.archived ? 'entry.archived' : 'entry.restored' : 'entry.updated',id);
      return saved;
    });
    res.json(updated);
  });

  router.post('/conclusions', async (req,res) => {
    const actor = req.actor;
    requireAccess(canWrite(actor.role));
    const {centreId,periodId,tab,type,...details} = conclusionInput.parse(req.body);
    requireActiveCentre(actor,centreId);
    const period = await requirePeriod(db,actor,periodId);
    const saved = await db.transaction(async tx => {
      const common = {orgId:actor.orgId,centreId,periodId};
      const [row] = await tx.insert(entries).values({ ...common, kind:'conclusion', category:tab, status:type, title:type,
        date:period.end, dueDate:details.dueDate, details }).returning();
      if (type === 'Discussion and action required') {
        const [action] = await tx.insert(actions).values({...common,conclusionId:row.id,tab,description:details.recommendation,owner:details.owner,
          dueDate:details.dueDate,priority:details.priority}).returning();
        await tx.insert(actionHistory).values({actionId:action.id,actorId:actor.id,changes:{status:'Pending',event:'Created from conclusion'}});
      }
      await log(tx,actor,'conclusion.created',row.id);
      return row;
    });
    res.status(201).json(saved);
  });

  router.get('/actions', async (req,res) => {
    const {centreId,periodId,page,status,owner,priority,tab,due} = pageQuery.extend({
      status:z.enum(['Open actions','All actions',...actionStatuses]).default('Open actions'),
      owner:z.string().trim().max(160).optional(), priority:z.enum(priorities).optional(),
      tab:z.enum(tabs.map(item => item.id)).optional(), due:z.iso.date().optional()
    }).parse(req.query);
    const period = periodId && await requirePeriod(db,req.actor,periodId);
    const scope = centreScope(req.actor,actions,centreId);
    const rows = await db.select({action:actions,periodName:periods.name,periodStart:periods.start}).from(actions)
      .innerJoin(periods,and(eq(periods.id,actions.periodId),eq(periods.orgId,actions.orgId)))
      .where(and(scope,
        period ? or(eq(actions.periodId,period.id),and(lte(periods.start,period.end),ne(actions.status,'Completed'))) : undefined,
        status === 'Open actions' ? ne(actions.status,'Completed') : status === 'All actions' ? undefined : eq(actions.status,status),
        owner ? sql`strpos(lower(${actions.owner}), lower(${owner})) > 0` : undefined,
        priority ? eq(actions.priority,priority) : undefined, tab ? eq(actions.tab,tab) : undefined,
        due ? lte(actions.dueDate,due) : undefined))
      .orderBy(asc(actions.dueDate),actions.id).limit(resultLimit + 1).offset((page-1)*resultLimit);
    const today = singaporeToday();
    res.json({rows:rows.slice(0,resultLimit).map(({action,periodName,periodStart}) => ({
      ...action,periodName,overdue:action.dueDate < today && action.status !== 'Completed',
      carriedForward:!!period && periodStart < period.start && action.status !== 'Completed'
    })),hasMore:rows.length > resultLimit});
  });

  router.get('/actions/:id/history', async (req,res) => {
    const id = uid.parse(req.params.id);
    const [action] = await db.select({id:actions.id}).from(actions).where(and(centreScope(req.actor,actions),eq(actions.id,id)));
    if (!action) throw new RequestError(404,'Action was not found.');
    const history = await db.select().from(actionHistory).where(eq(actionHistory.actionId,id)).orderBy(desc(actionHistory.createdAt)).limit(resultLimit);
    res.json(history);
  });

  router.patch('/actions/:id', async (req,res) => {
    const actor = req.actor;
    requireAccess(canWrite(actor.role));
    const id = uid.parse(req.params.id);
    const input = actionUpdate.parse(req.body);
    const saved = await db.transaction(async tx => {
      const [action] = await tx.select().from(actions).where(and(centreScope(actor,actions),eq(actions.id,id))).for('update');
      if (!action) throw new RequestError(404,'Action was not found.');
      requireActiveCentre(actor,action.centreId);
      if (action.status === 'Completed' && input.status !== 'Completed') requireAccess(canManage(actor.role));
      const completedAt = input.status === 'Completed' ? action.completedAt ?? new Date() : null;
      const [row] = await tx.update(actions).set({...input,completedAt,updatedAt:new Date()}).where(eq(actions.id,id)).returning();
      await tx.insert(actionHistory).values({actionId:id,actorId:actor.id,changes:{from:action.status,...input}});
      await log(tx,actor,'action.updated',id);
      return row;
    });
    res.json(saved);
  });
  return router;
}
