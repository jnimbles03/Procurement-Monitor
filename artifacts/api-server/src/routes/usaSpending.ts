import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { watchlistEntriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { enrichAllEntries, lookupUSASpending } from "../services/usaSpendingService";

const router = Router();

router.post("/watchlist/enrich-usaspending", async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await enrichAllEntries();
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "USASpending bulk enrichment failed");
    res.status(500).json({ error: "Enrichment failed" });
  }
});

router.post("/watchlist/:id/enrich-usaspending", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const rows = await db.select().from(watchlistEntriesTable).where(eq(watchlistEntriesTable.id, id));
    if (rows.length === 0) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    const entry = rows[0]!;
    const result = await lookupUSASpending(entry);

    await db
      .update(watchlistEntriesTable)
      .set({
        usaSpendingAwardId: result.awardId ?? null,
        usaSpendingRecipient: result.recipient ?? null,
        usaSpendingDescription: result.description ?? null,
        usaSpendingContractEnd: result.contractEnd ?? null,
        usaSpendingPotentialEnd: result.potentialEnd ?? null,
        usaSpendingAmount: result.amount != null ? String(result.amount) : null,
        usaSpendingLookedUpAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(watchlistEntriesTable.id, id));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "USASpending single enrichment failed");
    res.status(500).json({ error: "Enrichment failed" });
  }
});

export default router;
