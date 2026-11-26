import { db } from "@workspace/db";
import { watchlistEntriesTable, configTable } from "@workspace/db";
import { isNull } from "drizzle-orm";
import { logger } from "./logger";
import { enrichAllEntries } from "../services/usaSpendingService";

// Fictional sample rows only. Real watchlist data is loaded at runtime through the
// authenticated spreadsheet import (POST /api/watchlist/import) and must never be committed.
const WATCHLIST_DATA = [
  { agency: "Example State Department of Revenue", searchTerms: ["example state revenue esignature"], state: "EX", tcv: "250000", reason: "No Decision / Project Delayed", competitor: "Competitor A", rebidWindowStart: "2026-01-01", rebidWindowEnd: "2026-12-31", priority: "HIGH", notes: "Sample entry. Replace via the watchlist import." },
  { agency: "Example County Clerk", searchTerms: ["example county clerk contract management"], state: "EX", tcv: "100000", reason: "Price: License", competitor: "Competitor B", rebidWindowStart: "2026-06-01", rebidWindowEnd: "2027-06-30", priority: "MEDIUM", notes: "Sample entry. Replace via the watchlist import." },
  { agency: "Example Federal Agency", searchTerms: ["example federal agency electronic signature"], state: "DC", tcv: "500000", reason: "Stale Oppty", competitor: "Competitor C", rebidWindowStart: "2027-01-01", rebidWindowEnd: "2028-12-31", priority: "WATCH", notes: "Sample entry. Replace via the watchlist import." },
  { agency: "Example City Procurement Office", searchTerms: ["example city procurement CLM"], state: "EX", tcv: "50000", reason: "No Decision / Project Delayed", competitor: "N/A", rebidWindowStart: "2026-03-01", rebidWindowEnd: "2027-03-31", priority: "LOW", notes: "Sample entry. Replace via the watchlist import." },
];

const DEFAULT_CONFIG = [
  { key: "scan_window_days", value: "30" },
  { key: "match_threshold", value: "0.4" },
  { key: "search_keywords", value: JSON.stringify(["electronic signature", "esignature", "e-signature", "digital signature", "contract lifecycle management", "contract management", "CLM", "document management", "DocuSign", "Adobe Sign"]) },
  { key: "naics_codes", value: JSON.stringify(["541511", "541512", "511210", "518210", "541519"]) },
  { key: "schedule_enabled", value: "false" },
  { key: "schedule_time", value: "07:00" },
  { key: "email_enabled", value: "false" },
  { key: "email_smtp_server", value: "smtp.gmail.com" },
  { key: "email_smtp_port", value: "587" },
  { key: "email_sender_email", value: "" },
  { key: "email_recipients", value: "[]" },
];

function runEnrichmentInBackground(): void {
  logger.info("Starting USASpending enrichment in background...");
  enrichAllEntries()
    .then(({ enriched, notFound }) => {
      logger.info({ enriched, notFound }, "USASpending auto-enrichment complete");
    })
    .catch((err) => {
      logger.error({ err }, "USASpending auto-enrichment failed");
    });
}

export async function autoSeedIfEmpty(): Promise<void> {
  try {
    const existing = await db.select().from(watchlistEntriesTable);

    if (existing.length > 0) {
      logger.info({ count: existing.length }, "Database already seeded — skipping");

      // Entries exist but have never had USASpending looked up — enrich now
      const unenriched = await db
        .select()
        .from(watchlistEntriesTable)
        .where(isNull(watchlistEntriesTable.usaSpendingLookedUpAt));

      if (unenriched.length > 0) {
        logger.info({ count: unenriched.length }, "Entries missing USASpending data — enriching in background");
        runEnrichmentInBackground();
      }

      return;
    }

    logger.info("Empty database detected — seeding watchlist and config");
    await db.insert(watchlistEntriesTable).values(WATCHLIST_DATA);
    logger.info({ count: WATCHLIST_DATA.length }, "Watchlist entries seeded");

    for (const cfg of DEFAULT_CONFIG) {
      await db.insert(configTable).values(cfg).onConflictDoNothing();
    }
    logger.info("Config seeded");

    // Kick off USASpending enrichment in background immediately after seed
    runEnrichmentInBackground();
  } catch (err) {
    logger.error({ err }, "Auto-seed failed — app will continue without seed data");
  }
}
