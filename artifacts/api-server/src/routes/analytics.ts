import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { alertsTable, watchlistEntriesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/analytics/alerts-over-time", async (req: Request, res: Response): Promise<void> => {
  try {
    const days = parseInt(String(req.query.days ?? "90"), 10);
    const result = await db.execute(sql`
      SELECT 
        DATE(timestamp)::text as date,
        COUNT(*)::int as count
      FROM alerts
      WHERE timestamp >= NOW() - INTERVAL '${sql.raw(String(days))} days'
      GROUP BY DATE(timestamp)
      ORDER BY DATE(timestamp) ASC
    `);
    res.json(result.rows);
  } catch (err) {
    req.log.error({ err }, "Failed to get alerts over time");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/alerts-by-priority", async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute(sql`
      SELECT 
        watchlist_priority as priority,
        COUNT(*)::int as count
      FROM alerts
      GROUP BY watchlist_priority
      ORDER BY count DESC
    `);
    res.json(result.rows);
  } catch (err) {
    req.log.error({ err }, "Failed to get alerts by priority");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/top-agencies", async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(String(req.query.limit ?? "10"), 10);
    const result = await db.execute(sql`
      SELECT 
        watchlist_agency as agency,
        COUNT(*)::int as count
      FROM alerts
      GROUP BY watchlist_agency
      ORDER BY count DESC
      LIMIT ${limit}
    `);
    res.json(result.rows);
  } catch (err) {
    req.log.error({ err }, "Failed to get top agencies");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/rebid-timeline", async (req: Request, res: Response): Promise<void> => {
  try {
    const entries = await db
      .select()
      .from(watchlistEntriesTable)
      .orderBy(watchlistEntriesTable.rebidWindowStart);

    const today = new Date();
    const data = entries.map((entry) => {
      let status: "upcoming" | "active" | "closed" = "upcoming";
      if (entry.rebidWindowStart && entry.rebidWindowEnd) {
        const start = new Date(entry.rebidWindowStart);
        const end = new Date(entry.rebidWindowEnd);
        if (today < start) status = "upcoming";
        else if (today > end) status = "closed";
        else status = "active";
      }

      return {
        id: entry.id,
        agency: entry.agency,
        priority: entry.priority,
        tcv: entry.tcv,
        rebidWindowStart: entry.rebidWindowStart,
        rebidWindowEnd: entry.rebidWindowEnd,
        status,
      };
    });

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to get rebid timeline");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
