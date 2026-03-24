import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { alertsTable, watchlistEntriesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

router.get("/analytics/alerts-over-time", async (req: Request, res: Response): Promise<void> => {
  try {
    const days = clampInt(req.query.days, 1, 365, 90);
    const result = await db.execute(sql`
      SELECT 
        DATE(timestamp)::text as date,
        COUNT(*)::int as count
      FROM alerts
      WHERE timestamp >= NOW() - (${days} * INTERVAL '1 day')
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
    const limit = clampInt(req.query.limit, 1, 100, 10);
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

router.get("/analytics/pipeline-kpis", async (req: Request, res: Response): Promise<void> => {
  try {
    const [alertStats, watchlistStats, nextRebid] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(*)::int as total_alerts,
          COUNT(*) FILTER (WHERE watchlist_priority = 'HIGH')::int as high_priority,
          ROUND(AVG(match_score)::numeric, 3) as avg_match_score
        FROM alerts
      `),
      db.execute(sql`
        SELECT
          COUNT(*)::int as watchlist_count,
          COALESCE(SUM(tcv), 0) as total_tcv,
          COUNT(*) FILTER (
            WHERE rebid_window_start <= NOW() + INTERVAL '90 days'
            AND rebid_window_end >= NOW()
          )::int as active_rebid_count
        FROM watchlist_entries
      `),
      db.execute(sql`
        SELECT EXTRACT(DAY FROM (rebid_window_start - NOW()))::int as days_away
        FROM watchlist_entries
        WHERE rebid_window_start > NOW()
        ORDER BY rebid_window_start ASC
        LIMIT 1
      `),
    ]);

    const a = alertStats.rows[0] as Record<string, unknown>;
    const w = watchlistStats.rows[0] as Record<string, unknown>;
    const n = nextRebid.rows[0] as Record<string, unknown> | undefined;

    res.json({
      totalTcv: Number(w.total_tcv ?? 0),
      totalAlerts: Number(a.total_alerts ?? 0),
      highPriorityAlerts: Number(a.high_priority ?? 0),
      avgMatchScore: Number(a.avg_match_score ?? 0),
      nextRebidDays: n ? Number(n.days_away) : null,
      watchlistCount: Number(w.watchlist_count ?? 0),
      activeRebidCount: Number(w.active_rebid_count ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get pipeline KPIs");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/tcv-by-priority", async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute(sql`
      SELECT
        priority,
        COUNT(*)::int as count,
        COALESCE(SUM(tcv), 0)::float as tcv
      FROM watchlist_entries
      GROUP BY priority
      ORDER BY
        CASE priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'WATCH' THEN 3 ELSE 4 END
    `);
    res.json(result.rows.map((r) => {
      const row = r as Record<string, unknown>;
      return { priority: row.priority, count: Number(row.count), tcv: Number(row.tcv) };
    }));
  } catch (err) {
    req.log.error({ err }, "Failed to get TCV by priority");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/competitor-breakdown", async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute(sql`
      SELECT
        COALESCE(NULLIF(TRIM(competitor), ''), 'Unknown') as competitor,
        COUNT(*)::int as count,
        COALESCE(SUM(tcv), 0)::float as total_tcv
      FROM watchlist_entries
      GROUP BY COALESCE(NULLIF(TRIM(competitor), ''), 'Unknown')
      ORDER BY total_tcv DESC
    `);
    res.json(result.rows.map((r) => {
      const row = r as Record<string, unknown>;
      return { competitor: row.competitor, count: Number(row.count), totalTcv: Number(row.total_tcv) };
    }));
  } catch (err) {
    req.log.error({ err }, "Failed to get competitor breakdown");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/match-score-distribution", async (req: Request, res: Response): Promise<void> => {
  try {
    const buckets = [
      { range: "90-100%", min: 90, max: 100 },
      { range: "70-89%", min: 70, max: 89 },
      { range: "50-69%", min: 50, max: 69 },
      { range: "30-49%", min: 30, max: 49 },
      { range: "0-29%", min: 0, max: 29 },
    ];

    const result = await db.execute(sql`
      SELECT
        CASE
          WHEN match_score >= 0.9 THEN '90-100%'
          WHEN match_score >= 0.7 THEN '70-89%'
          WHEN match_score >= 0.5 THEN '50-69%'
          WHEN match_score >= 0.3 THEN '30-49%'
          ELSE '0-29%'
        END as range,
        COUNT(*)::int as count
      FROM alerts
      GROUP BY 1
    `);

    const counts = new Map((result.rows as Array<Record<string, unknown>>).map((r) => [String(r.range), Number(r.count)]));

    res.json(buckets.map((b) => ({
      range: b.range,
      count: counts.get(b.range) ?? 0,
      minScore: b.min,
      maxScore: b.max,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to get match score distribution");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/federal-expiry", async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute(sql`
      SELECT
        id,
        agency,
        priority,
        tcv::float,
        usa_spending_recipient,
        usa_spending_contract_end,
        usa_spending_potential_end,
        usa_spending_amount,
        CASE
          WHEN usa_spending_potential_end IS NOT NULL
          THEN EXTRACT(DAY FROM (TO_DATE(usa_spending_potential_end, 'YYYY-MM-DD') - CURRENT_DATE))::int
          WHEN usa_spending_contract_end IS NOT NULL
          THEN EXTRACT(DAY FROM (TO_DATE(usa_spending_contract_end, 'YYYY-MM-DD') - CURRENT_DATE))::int
          ELSE NULL
        END as days_to_expiry
      FROM watchlist_entries
      WHERE usa_spending_looked_up_at IS NOT NULL
      ORDER BY days_to_expiry ASC NULLS LAST
    `);

    res.json(result.rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: Number(row.id),
        agency: row.agency,
        priority: row.priority,
        tcv: row.tcv ? Number(row.tcv) : null,
        usaSpendingRecipient: row.usa_spending_recipient ?? null,
        usaSpendingContractEnd: row.usa_spending_contract_end ?? null,
        usaSpendingPotentialEnd: row.usa_spending_potential_end ?? null,
        usaSpendingAmount: row.usa_spending_amount ?? null,
        daysToExpiry: row.days_to_expiry ? Number(row.days_to_expiry) : null,
      };
    }));
  } catch (err) {
    req.log.error({ err }, "Failed to get federal expiry data");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/win-back-readiness", async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute(sql`
      SELECT
        w.id,
        w.agency,
        w.priority,
        w.tcv::float as tcv,
        w.competitor,
        w.state,
        w.rebid_window_start,
        w.rebid_window_end,
        w.usa_spending_contract_end,
        w.usa_spending_potential_end,
        w.usa_spending_looked_up_at,
        COUNT(a.id)::int as alert_count,
        ROUND(MAX(a.match_score)::numeric, 3) as best_match_score,
        EXTRACT(DAY FROM (w.rebid_window_start - NOW()))::int as days_to_open,
        EXTRACT(DAY FROM (w.rebid_window_end - NOW()))::int as days_to_close
      FROM watchlist_entries w
      LEFT JOIN alerts a ON a.watchlist_agency = w.agency
      GROUP BY w.id
    `);

    const entries = (result.rows as Array<Record<string, unknown>>).map((row) => {
      const tcv = Number(row.tcv ?? 0);
      const alertCount = Number(row.alert_count ?? 0);
      const bestMatchScore = row.best_match_score != null ? Number(row.best_match_score) : null;
      const daysToOpen = row.days_to_open != null ? Number(row.days_to_open) : null;
      const daysToClose = row.days_to_close != null ? Number(row.days_to_close) : null;
      const hasUsaSpendingIntel = row.usa_spending_looked_up_at != null;

      // Urgency score (0-40)
      let urgencyScore = 0;
      if (daysToClose != null && daysToClose <= 0) {
        urgencyScore = 0; // expired
      } else if (daysToOpen != null && daysToOpen <= 0) {
        urgencyScore = 40; // window is currently open
      } else if (daysToOpen != null && daysToOpen <= 90) {
        urgencyScore = 35; // opens very soon
      } else if (daysToOpen != null && daysToOpen <= 180) {
        urgencyScore = 25;
      } else if (daysToOpen != null && daysToOpen <= 365) {
        urgencyScore = 15;
      } else {
        urgencyScore = 5;
      }

      // Signal score (0-30)
      let signalScore = 0;
      if (alertCount > 0 && bestMatchScore != null) {
        if (bestMatchScore >= 0.8) signalScore = 30;
        else if (bestMatchScore >= 0.5) signalScore = 20;
        else signalScore = 10;
      }

      // Intel score (0-20)
      const intelScore = hasUsaSpendingIntel ? 20 : 0;

      // Value score (0-10)
      let valueScore = 1;
      if (tcv >= 500000) valueScore = 10;
      else if (tcv >= 200000) valueScore = 7;
      else if (tcv >= 100000) valueScore = 5;
      else if (tcv >= 50000) valueScore = 3;

      const winBackScore = urgencyScore + signalScore + intelScore + valueScore;

      // Status
      let status: "ACT_NOW" | "IMMINENT" | "PREPARE" | "PLAN" | "EXPIRED";
      if (daysToClose != null && daysToClose <= 0) {
        status = "EXPIRED";
      } else if (daysToOpen != null && daysToOpen <= 0) {
        status = "ACT_NOW";
      } else if (daysToOpen != null && daysToOpen <= 90) {
        status = "IMMINENT";
      } else if (daysToOpen != null && daysToOpen <= 365) {
        status = "PREPARE";
      } else {
        status = "PLAN";
      }

      // Urgency label
      const urgencyLabelMap: Record<string, string> = {
        ACT_NOW: "In Rebid Window",
        IMMINENT: `Opens in ${daysToOpen ?? "?"} days`,
        PREPARE: `Opens in ${daysToOpen ?? "?"} days`,
        PLAN: `Opens in ${daysToOpen ?? "?"} days`,
        EXPIRED: "Window Closed",
      };
      const urgencyLabel = urgencyLabelMap[status] ?? "";

      // Action hint
      let actionHint = "Monitor for procurement signals";
      if (status === "ACT_NOW") {
        actionHint = alertCount > 0
          ? `${alertCount} active signal${alertCount > 1 ? "s" : ""} — engage procurement team now`
          : "Window open — initiate outreach now";
      } else if (status === "IMMINENT") {
        actionHint = alertCount > 0
          ? `${alertCount} early signal${alertCount > 1 ? "s" : ""} — prepare proposal`
          : "Begin discovery, 90 days to window";
      } else if (status === "PREPARE") {
        actionHint = hasUsaSpendingIntel
          ? "Federal intel available — schedule stakeholder review"
          : "Build relationship, identify new contacts";
      } else if (status === "EXPIRED") {
        actionHint = "Confirm if re-procured, update record";
      }

      return {
        id: Number(row.id),
        agency: String(row.agency),
        priority: String(row.priority),
        tcv,
        competitor: String(row.competitor ?? ""),
        state: String(row.state ?? ""),
        rebidWindowStart: row.rebid_window_start ? String(row.rebid_window_start).slice(0, 10) : null,
        rebidWindowEnd: row.rebid_window_end ? String(row.rebid_window_end).slice(0, 10) : null,
        daysToOpen,
        daysToClose,
        alertCount,
        bestMatchScore,
        hasUsaSpendingIntel,
        usaSpendingContractEnd: row.usa_spending_contract_end ? String(row.usa_spending_contract_end).slice(0, 10) : null,
        winBackScore,
        status,
        urgencyLabel,
        actionHint,
      };
    });

    // Sort by win-back score descending
    entries.sort((a, b) => b.winBackScore - a.winBackScore);

    res.json(entries);
  } catch (err) {
    req.log.error({ err }, "Failed to get win-back readiness");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

