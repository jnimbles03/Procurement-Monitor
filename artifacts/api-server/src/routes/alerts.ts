import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { alertsTable, watchlistEntriesTable, configTable } from "@workspace/db";
import { eq, and, gte, lte, sql, count, desc } from "drizzle-orm";

function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

const router = Router();

router.get("/alerts/stats", async (req: Request, res: Response): Promise<void> => {
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

router.get("/alerts", async (req: Request, res: Response): Promise<void> => {
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

router.get("/alerts/:id/breakdown", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid alert id" }); return; }

    const [alert] = await db.select().from(alertsTable).where(eq(alertsTable.id, id));
    if (!alert) { res.status(404).json({ error: "Alert not found" }); return; }

    const [watchlistEntry] = alert.agencyMatchId != null
      ? await db
          .select()
          .from(watchlistEntriesTable)
          .where(eq(watchlistEntriesTable.id, alert.agencyMatchId))
      : [];

    const configRows = await db.select().from(configTable);
    const config: Record<string, string> = {};
    for (const row of configRows) config[row.key] = row.value;
    const globalKeywords: string[] = JSON.parse(config["search_keywords"] ?? "[]");

    const searchTerms: string[] = (watchlistEntry?.searchTerms as string[]) ?? [];

    const oppText = alert.opportunityTitle ?? "";
    const oppWords = new Set(normalizeText(oppText));

    let baseScore = 0;
    const termBreakdowns = searchTerms.map((term) => {
      const termWords = normalizeText(term);
      const matchedWords = termWords.filter((w) => oppWords.has(w));
      const termScore = termWords.length > 0 ? matchedWords.length / termWords.length : 0;
      baseScore = Math.max(baseScore, termScore);
      return { term, termWords, matchedWords, termScore, isBestTerm: false };
    });

    for (const tb of termBreakdowns) {
      tb.isBestTerm = Math.abs(tb.termScore - baseScore) < 0.001 && baseScore > 0;
    }

    const lowerOpp = oppText.toLowerCase();
    const globalKeywordsMatched = globalKeywords.filter((kw) =>
      lowerOpp.includes(kw.toLowerCase())
    );
    const globalKeywordBonus = globalKeywordsMatched.length > 0 ? 0.2 : 0;

    res.json({
      id: alert.id,
      opportunityTitle: alert.opportunityTitle,
      matchScore: parseFloat(String(alert.matchScore)),
      watchlistAgency: alert.watchlistAgency,
      searchTerms,
      watchlistReason: watchlistEntry?.reason ?? "",
      watchlistNotes: watchlistEntry?.notes ?? "",
      termBreakdowns,
      baseScore,
      globalKeywordBonus,
      globalKeywordsMatched,
      oppWordsUsed: Array.from(oppWords).sort(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get alert breakdown");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/alerts/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const [deleted] = await db.delete(alertsTable).where(eq(alertsTable.id, id)).returning();
    if (!deleted) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete alert");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
