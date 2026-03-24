import { Router } from "express";
import { db } from "@workspace/db";
import { scanLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { runScan } from "../services/samScanner";

const router = Router();

router.post("/scan", async (req, res) => {
  try {
    const { scanWindowDays = 30, useKeywords = true, useNaics = true } = req.body;

    const [scanLog] = await db
      .insert(scanLogsTable)
      .values({
        scanWindowDays: Number(scanWindowDays),
        status: "running",
        progressLog: `[${new Date().toISOString().substring(11, 19)}] Scan initiated...`,
        totalOpportunities: 0,
        totalAlerts: 0,
      })
      .returning();

    runScan(scanLog.id, Number(scanWindowDays), Boolean(useKeywords), Boolean(useNaics)).catch((err) => {
      req.log.error({ err, scanLogId: scanLog.id }, "Background scan failed unexpectedly");
    });

    res.json(scanLog);
  } catch (err) {
    req.log.error({ err }, "Failed to trigger scan");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/scan", async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit ?? "20"), 10);
    const logs = await db
      .select()
      .from(scanLogsTable)
      .orderBy(desc(scanLogsTable.startedAt))
      .limit(limit);
    res.json(logs);
  } catch (err) {
    req.log.error({ err }, "Failed to list scan logs");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/scan/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [log] = await db.select().from(scanLogsTable).where(eq(scanLogsTable.id, id));
    if (!log) return res.status(404).json({ error: "Not found" });
    res.json(log);
  } catch (err) {
    req.log.error({ err }, "Failed to get scan log");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
