import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { organisations, centres, periods, settings, aliases, sources, syncJobs } from './db/schema.js';
import { centreInput, periodInput, settingsInput, short, uid } from './validation-hub.js';
import { requireAccess, RequestError, log } from './report-routes.js';
import { sourceRegistry } from './integrations/contracts.js';

export function adminRoutes(db, config) {
  const router = Router();
  router.get('/workspace', async (req,res) => {
    const {actor} = req;
    const [[org], [preferences], dates] = await Promise.all([
      db.select().from(organisations).where(eq(organisations.id,actor.orgId)),
      db.select().from(settings).where(eq(settings.orgId,actor.orgId)),
      db.select().from(periods).where(eq(periods.orgId,actor.orgId)).orderBy(desc(periods.start),periods.name)
    ]);
    res.json({organisation:org.name, settings:preferences, centres:actor.centres, periods:dates,
      user:{id:actor.id,name:actor.name,role:actor.role}, demo:config.demo});
  });

  router.use('/admin', (req,_res,next) => { requireAccess(req.actor.role === 'hq_admin'); next(); });
  router.post('/admin/centres', async (req,res) => {
    const input = centreInput.parse(req.body);
    const row = await db.transaction(async tx => {
      const [result] = await tx.insert(centres).values({...input,orgId:req.actor.orgId}).returning();
      await log(tx,req.actor,'centre.created',result.id);
      return result;
    });
    res.status(201).json(row);
  });
  router.patch('/admin/centres/:id', async (req,res) => {
    const id = uid.parse(req.params.id);
    const input = centreInput.parse(req.body);
    const row = await db.transaction(async tx => {
      const [result] = await tx.update(centres).set({...input,updatedAt:new Date()})
        .where(and(eq(centres.orgId,req.actor.orgId),eq(centres.id,id))).returning();
      if (!result) throw new RequestError(404,'Centre was not found.');
      await log(tx,req.actor,'centre.updated',id);
      return result;
    });
    res.json(row);
  });
  router.post('/admin/periods', async (req,res) => {
    const input = periodInput.parse(req.body);
    const row = await db.transaction(async tx => {
      const [result] = await tx.insert(periods).values({...input,orgId:req.actor.orgId}).returning();
      await log(tx,req.actor,'period.created',result.id);
      return result;
    });
    res.status(201).json(row);
  });
  router.put('/admin/settings', async (req,res) => {
    const {name,...input} = settingsInput.parse(req.body);
    await db.transaction(async tx => {
      await tx.update(organisations).set({name}).where(eq(organisations.id,req.actor.orgId));
      await tx.insert(settings).values({...input,orgId:req.actor.orgId}).onConflictDoUpdate({
        target:settings.orgId,set:{...input,updatedAt:new Date()}
      });
      await log(tx,req.actor,'settings.updated',req.actor.orgId);
    });
    res.json({saved:true});
  });
  router.get('/admin/sources', async (req,res) => {
    const orgId = req.actor.orgId;
    const [configured, mappings] = await Promise.all([
      db.select().from(sources).where(eq(sources.orgId,orgId)),
      db.select().from(aliases).where(eq(aliases.orgId,orgId)).orderBy(aliases.alias)
    ]);
    const rows = await Promise.all(sourceRegistry.map(async source => {
      const saved = configured.find(item => item.key === source.key);
      const history = saved ? await db.select().from(syncJobs).where(eq(syncJobs.sourceId,saved.id)).orderBy(desc(syncJobs.createdAt)).limit(10) : [];
      return {...source, status:'Awaiting adapter', history, aliases:mappings.filter(mapping => mapping.sourceId === saved?.id) };
    }));
    res.json(rows);
  });
  router.post('/admin/sources/:key/aliases', async (req,res) => {
    const source = sourceRegistry.find(item => item.key === req.params.key);
    if (!source) throw new RequestError(404,'Source was not found.');
    const {alias,centreId} = z.object({alias:short,centreId:uid}).strict().parse(req.body);
    const {actor} = req;
    requireAccess(actor.centres.some(centre => centre.id === centreId && centre.active));
    const mapping = await db.transaction(async tx => {
      await tx.insert(sources).values({orgId:actor.orgId,key:source.key}).onConflictDoNothing();
      const [record] = await tx.select().from(sources).where(and(eq(sources.orgId,actor.orgId),eq(sources.key,source.key)));
      const [row] = await tx.insert(aliases).values({orgId:actor.orgId,sourceId:record.id,centreId,alias}).returning();
      await log(tx,actor,'centre_alias.created',row.id);
      return row;
    });
    res.status(201).json(mapping);
  });
  router.post('/admin/sources/aliases/:id/remove', async (req,res) => {
    const id = uid.parse(req.params.id);
    await db.transaction(async tx => {
      const [row] = await tx.delete(aliases).where(and(eq(aliases.orgId,req.actor.orgId),eq(aliases.id,id))).returning();
      if (!row) throw new RequestError(404,'Alias was not found.');
      await log(tx,req.actor,'centre_alias.removed',id);
    });
    res.json({removed:true});
  });
  return router;
}