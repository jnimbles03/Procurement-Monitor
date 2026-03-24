import { Router } from "express";
import { db } from "@workspace/db";
import { alertsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, count, desc } from "drizzle-orm";

const router = Router();

router.get("/alerts/stats", async (req, res) => {
  try {
    const [stats] = await db
      .select({
        totalAlerts: count(alertsTable.id),
      })
      .from(alertsTable);

    const [highCount] = await db
      .select({ count: count(alertsTable.id) })
      .from(alertsTable)
      .where(eq(alertsTable.watchlistPriority, "HIGH"));

    const uniqueAgencies = await db
      .selectDistinct({ agency: alertsTable.watchlistAgency })
      .from(alertsTable);

    const tcvResult = await db
      .select({ total: sql<string>`COALESCE(SUM(CAST(watchlist_tcv AS NUMERIC)), 0)` })
      .from(alertsTable);

    res.json({
      totalAlerts: stats?.totalAlerts ?? 0,
      highPriorityAlerts: highCount?.count ?? 0,
      uniqueAgencies: uniqueAgencies.length,
      totalPipelineTcv: parseFloat(tcvResult[0]?.total ?? "0"),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get alert stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/alerts", async (req, res) => {
  try {
    const { priority, agencyMatchId, minMatchScore, dateFrom, dateTo, limit = "200", offset = "0" } = req.query;

    const conditions = [];
    if (priority) conditions.push(eq(alertsTable.watchlistPriority, String(priority)));
    if (agencyMatchId) conditions.push(eq(alertsTable.agencyMatchId, parseInt(String(agencyMatchId), 10)));
    if (minMatchScore) conditions.push(gte(alertsTable.matchScore, String(minMatchScore)));
    if (dateFrom) conditions.push(gte(alertsTable.timestamp, new Date(String(dateFrom))));
    if (dateTo) conditions.push(lte(alertsTable.timestamp, new Date(String(dateTo))));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db
      .select({ total: count(alertsTable.id) })
      .from(alertsTable)
      .where(whereClause);

    const data = await db
      .select()
      .from(alertsTable)
      .where(whereClause)
      .orderBy(desc(alertsTable.timestamp))
      .limit(parseInt(String(limit), 10))
      .offset(parseInt(String(offset), 10));

    res.json({ data, total });
  } catch (err) {
    req.log.error({ err }, "Failed to list alerts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/alerts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [deleted] = await db.delete(alertsTable).where(eq(alertsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete alert");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
