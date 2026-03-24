import { Router } from "express";
import { db } from "@workspace/db";
import { watchlistEntriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/watchlist", async (req, res) => {
  try {
    const entries = await db.select().from(watchlistEntriesTable).orderBy(watchlistEntriesTable.id);
    res.json(entries);
  } catch (err) {
    req.log.error({ err }, "Failed to list watchlist entries");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/watchlist", async (req, res) => {
  try {
    const body = req.body;
    const searchTerms = Array.isArray(body.searchTerms)
      ? body.searchTerms
      : typeof body.searchTerms === "string"
      ? body.searchTerms.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

    const [entry] = await db
      .insert(watchlistEntriesTable)
      .values({
        agency: body.agency,
        searchTerms,
        state: body.state ?? "",
        tcv: body.tcv ?? "0",
        reason: body.reason ?? "",
        competitor: body.competitor ?? "",
        rebidWindowStart: body.rebidWindowStart ?? null,
        rebidWindowEnd: body.rebidWindowEnd ?? null,
        priority: body.priority ?? "WATCH",
        notes: body.notes ?? "",
      })
      .returning();

    res.status(201).json(entry);
  } catch (err) {
    req.log.error({ err }, "Failed to create watchlist entry");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/watchlist/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [entry] = await db.select().from(watchlistEntriesTable).where(eq(watchlistEntriesTable.id, id));
    if (!entry) return res.status(404).json({ error: "Not found" });
    res.json(entry);
  } catch (err) {
    req.log.error({ err }, "Failed to get watchlist entry");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/watchlist/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = req.body;
    const searchTerms = Array.isArray(body.searchTerms)
      ? body.searchTerms
      : typeof body.searchTerms === "string"
      ? body.searchTerms.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

    const [entry] = await db
      .update(watchlistEntriesTable)
      .set({
        agency: body.agency,
        searchTerms,
        state: body.state ?? "",
        tcv: body.tcv ?? "0",
        reason: body.reason ?? "",
        competitor: body.competitor ?? "",
        rebidWindowStart: body.rebidWindowStart ?? null,
        rebidWindowEnd: body.rebidWindowEnd ?? null,
        priority: body.priority ?? "WATCH",
        notes: body.notes ?? "",
        updatedAt: new Date(),
      })
      .where(eq(watchlistEntriesTable.id, id))
      .returning();

    if (!entry) return res.status(404).json({ error: "Not found" });
    res.json(entry);
  } catch (err) {
    req.log.error({ err }, "Failed to update watchlist entry");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/watchlist/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [deleted] = await db
      .delete(watchlistEntriesTable)
      .where(eq(watchlistEntriesTable.id, id))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete watchlist entry");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
