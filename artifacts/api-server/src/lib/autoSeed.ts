import { db } from "@workspace/db";
import { watchlistEntriesTable, configTable } from "@workspace/db";
import { logger } from "./logger";

const WATCHLIST_DATA = [
  { agency: "Citizens Property Insurance", searchTerms: ["citizens property insurance", "citizens insurance esignature"], state: "FL", tcv: "704062", reason: "No Decision / Project Delayed", competitor: "Adobe", rebidWindowStart: "2025-04-01", rebidWindowEnd: "2026-06-30", priority: "HIGH", notes: "Explicitly delayed to Q4 2024. Salesforce integration deal." },
  { agency: "Ohio Department of Job & Family Services", searchTerms: ["ohio job family services", "ohio DJF", "ohio ODJFS esignature"], state: "OH", tcv: "606500", reason: "No Decision / Project Delayed", competitor: "Other", rebidWindowStart: "2025-11-01", rebidWindowEnd: "2026-12-31", priority: "HIGH", notes: "Restarting from scratch. Previous team relationship was poor." },
  { agency: "Minnesota Judicial Branch", searchTerms: ["minnesota judicial", "minnesota courts esignature", "MN courts"], state: "MN", tcv: "164419", reason: "No Decision / Project Delayed", competitor: "Adobe", rebidWindowStart: "2025-03-01", rebidWindowEnd: "2026-06-30", priority: "HIGH", notes: "CIO deprioritized. Courts modernization wave happening nationwide." },
  { agency: "Puerto Rico Judicial Branch", searchTerms: ["puerto rico judicial", "puerto rico ASG", "administracion servicios generales"], state: "PR", tcv: "206500", reason: "No Decision / Project Delayed", competitor: "Adobe", rebidWindowStart: "2025-07-01", rebidWindowEnd: "2026-12-31", priority: "HIGH", notes: "Project delayed. Monitor SAM.gov and PR state portal." },
  { agency: "Land Registers of Northern Ireland", searchTerms: ["land registers northern ireland", "LRNI"], state: "INTL", tcv: "165444", reason: "No Decision / Project Delayed", competitor: "Adobe", rebidWindowStart: "2025-10-01", rebidWindowEnd: "2026-12-31", priority: "HIGH", notes: "Explicitly said 'will reopen at later date'. eSign+CLM+Identity." },
  { agency: "Pôle Emploi / France Travail", searchTerms: ["pole emploi", "france travail", "esignature"], state: "INTL", tcv: "321177", reason: "Price: License", competitor: "DocaPost", rebidWindowStart: "2026-01-01", rebidWindowEnd: "2028-04-30", priority: "MEDIUM", notes: "Lost on 50% price weighting. DocaPost 3yr contract expiry ~Apr 2026." },
  { agency: "Transport Canada / Shared Services Canada", searchTerms: ["transport canada esignature", "shared services canada electronic signature"], state: "INTL", tcv: "85808", reason: "Price: License", competitor: "Nintex", rebidWindowStart: "2026-01-01", rebidWindowEnd: "2028-05-31", priority: "MEDIUM", notes: "Nintex 3yr contract expiry ~May 2026. Federal contract via SSC." },
  { agency: "South Dakota Department of Health", searchTerms: ["south dakota health", "south dakota contract management", "SD CLM"], state: "SD", tcv: "144000", reason: "Price: License", competitor: "IronClad", rebidWindowStart: "2026-06-01", rebidWindowEnd: "2028-09-30", priority: "MEDIUM", notes: "Two CLM deals. IronClad 3yr expiry ~Sep 2026. Bundle with SD DHS." },
  { agency: "South Dakota Department of Human Services", searchTerms: ["south dakota human services", "south dakota DHS CLM"], state: "SD", tcv: "60000", reason: "Price: License", competitor: "IronClad", rebidWindowStart: "2026-06-01", rebidWindowEnd: "2028-09-30", priority: "MEDIUM", notes: "Same state as SD Health. Bundle approach." },
  { agency: "Maryland State Department of Education", searchTerms: ["maryland education", "MSDE contract management", "maryland DOE CLM"], state: "MD", tcv: "50000", reason: "Price: License", competitor: "Will Not Disclose", rebidWindowStart: "2026-07-01", rebidWindowEnd: "2028-10-31", priority: "MEDIUM", notes: "Already won MD Commerce and MD Labor. Leverage state relationships." },
  { agency: "Lower Colorado River Authority", searchTerms: ["lower colorado river authority", "LCRA CLM", "LCRA contract"], state: "TX", tcv: "210000", reason: "No Decision / Project Delayed", competitor: "N/A", rebidWindowStart: "2025-10-01", rebidWindowEnd: "2026-12-31", priority: "MEDIUM", notes: "Stalled on integration concerns. Address integration story proactively." },
  { agency: "County of Cobb", searchTerms: ["cobb county", "cobb county CLM", "cobb county contract"], state: "GA", tcv: "90900", reason: "No Decision / Project Delayed", competitor: "N/A", rebidWindowStart: "2025-09-01", rebidWindowEnd: "2026-12-31", priority: "MEDIUM", notes: "Awarded eProcurement to OpenGov; CLM RFP anticipated separately." },
  { agency: "Federal Aviation Administration", searchTerms: ["FAA esignature", "federal aviation administration document management", "FAA CLM"], state: "DC", tcv: "198000", reason: "Stale Oppty", competitor: "Adobe", rebidWindowStart: "2026-01-01", rebidWindowEnd: "2027-12-31", priority: "MEDIUM", notes: "Stale opportunity. Watch for new RFP activity." },
  { agency: "US General Services Administration", searchTerms: ["GSA esignature", "general services administration CLM", "GSA contract management"], state: "DC", tcv: "0", reason: "No Decision / Project Delayed", competitor: "N/A", rebidWindowStart: "2026-01-01", rebidWindowEnd: "2027-12-31", priority: "MEDIUM", notes: "Project stalled. GSA is a major procurement channel." },
  { agency: "US Courts Defender Service Division", searchTerms: ["US courts esignature", "courts defender service", "judicial electronic signature"], state: "DC", tcv: "2335823", reason: "Price: License", competitor: "Madison Cloud", rebidWindowStart: "2027-01-01", rebidWindowEnd: "2029-04-30", priority: "WATCH", notes: "Biggest single loss ($2.34M). Madison Cloud won. Start building now." },
  { agency: "Florida Department of Children & Families", searchTerms: ["florida DCF", "florida children families", "FL DCF contract management"], state: "FL", tcv: "226981", reason: "Price: Professional Services", competitor: "Authorium", rebidWindowStart: "2027-06-01", rebidWindowEnd: "2029-09-30", priority: "WATCH", notes: "Authorium 'low balled services and licensing'. Watch for complaints." },
  { agency: "State of New Mexico CYFD", searchTerms: ["new mexico children youth", "new mexico CYFD", "NM CCWIS"], state: "NM", tcv: "184186", reason: "Price: License", competitor: "Adobe", rebidWindowStart: "2027-01-01", rebidWindowEnd: "2029-01-31", priority: "WATCH", notes: "Lost via Accenture SI. Consider different SI partner path." },
  { agency: "County of Allegheny", searchTerms: ["allegheny county", "allegheny DHS CLM", "allegheny contract management"], state: "PA", tcv: "127845", reason: "Price: License", competitor: "Will Not Disclose", rebidWindowStart: "2027-03-01", rebidWindowEnd: "2029-06-30", priority: "WATCH", notes: "Requested debrief — use learnings for next round." },
  { agency: "Illinois Secretary of State", searchTerms: ["illinois secretary of state", "IL SOS document management", "IL SOS CLM"], state: "IL", tcv: "120000", reason: "Price: License", competitor: "Global Solutions Group", rebidWindowStart: "2027-05-01", rebidWindowEnd: "2029-08-31", priority: "WATCH", notes: "Lost to doc mgmt specialist at $1.08M/3yr. We were 4x on price." },
  { agency: "Connecticut DEEP", searchTerms: ["connecticut DEEP", "CT department energy environmental", "CT CLM"], state: "CT", tcv: "25000", reason: "No Decision / Project Delayed", competitor: "N/A", rebidWindowStart: "2025-10-01", rebidWindowEnd: "2026-12-31", priority: "LOW", notes: "Champion left. Find new sponsor; need still exists." },
  { agency: "Hennepin County", searchTerms: ["hennepin county", "hennepin CLM", "hennepin contract management"], state: "MN", tcv: "59710", reason: "No Decision / Project Delayed", competitor: "N/A", rebidWindowStart: "2026-06-01", rebidWindowEnd: "2027-06-30", priority: "LOW", notes: "No next steps currently. Nurture long-term." },
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

export async function autoSeedIfEmpty(): Promise<void> {
  try {
    const existing = await db.select().from(watchlistEntriesTable);
    if (existing.length > 0) {
      logger.info({ count: existing.length }, "Database already seeded — skipping");
      return;
    }

    logger.info("Empty database detected — seeding watchlist and config");
    await db.insert(watchlistEntriesTable).values(WATCHLIST_DATA);
    logger.info({ count: WATCHLIST_DATA.length }, "Watchlist entries seeded");

    for (const cfg of DEFAULT_CONFIG) {
      await db.insert(configTable).values(cfg).onConflictDoNothing();
    }
    logger.info("Config seeded");
  } catch (err) {
    logger.error({ err }, "Auto-seed failed — app will continue without seed data");
  }
}
