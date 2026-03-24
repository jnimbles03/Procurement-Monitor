import axios from "axios";
import { db } from "@workspace/db";
import {
  watchlistEntriesTable,
  alertsTable,
  scanLogsTable,
  configTable,
  type WatchlistEntry,
  type InsertAlert,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";

const SAM_API_BASE = "https://api.sam.gov/opportunities/v2/search";

interface SamOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber?: string;
  postedDate?: string;
  responseDeadLine?: string;
  fullParentPathName?: string;
  organizationName?: string;
  description?: string;
  uiLink?: string;
}

interface SamApiResponse {
  opportunitiesData?: SamOpportunity[];
  totalRecords?: number;
}

async function getConfig(): Promise<Record<string, string>> {
  const rows = await db.select().from(configTable);
  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }
  return config;
}

function formatDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function scoreMatch(opportunityText: string, searchTerms: string[], globalKeywords: string[]): number {
  const oppWords = new Set(normalizeText(opportunityText));
  let score = 0;
  let termCount = 0;

  for (const term of searchTerms) {
    const termWords = normalizeText(term);
    if (termWords.length === 0) continue;
    termCount++;
    const matches = termWords.filter((w) => oppWords.has(w)).length;
    const termScore = matches / termWords.length;
    score = Math.max(score, termScore);
  }

  if (termCount === 0) return 0;

  const lowerOpp = opportunityText.toLowerCase();
  for (const kw of globalKeywords) {
    if (lowerOpp.includes(kw.toLowerCase())) {
      score += 0.2;
      break;
    }
  }

  return Math.min(1.0, score);
}

const MAX_RATE_LIMIT_RETRIES = 3;

async function fetchSamOpportunities(
  params: Record<string, string>,
  apiKey: string,
  appendLog: (msg: string) => Promise<void>
): Promise<SamOpportunity[]> {
  const results: SamOpportunity[] = [];
  let offset = 0;
  const limit = 1000;
  let rateLimitRetries = 0;

  while (true) {
    const queryParams = {
      api_key: apiKey,
      limit: String(limit),
      offset: String(offset),
      ...params,
    };

    try {
      await appendLog(`  Fetching offset=${offset}...`);
      const resp = await axios.get<SamApiResponse>(SAM_API_BASE, {
        params: queryParams,
        timeout: 30000,
      });

      const data = resp.data;
      const opps = data.opportunitiesData ?? [];
      results.push(...opps);
      await appendLog(`  Got ${opps.length} opportunities (total so far: ${results.length})`);
      rateLimitRetries = 0; // reset on success

      if (opps.length < limit) break;
      offset += limit;
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        rateLimitRetries++;
        if (rateLimitRetries > MAX_RATE_LIMIT_RETRIES) {
          await appendLog(`  Rate limited (429) — exceeded ${MAX_RATE_LIMIT_RETRIES} retries. Skipping this query.`);
          break;
        }
        await appendLog(`  Rate limited (429). Waiting 60s... (retry ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, 60000));
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      await appendLog(`  Error fetching SAM.gov: ${msg}`);
      break;
    }
  }

  return results;
}

export async function runScan(
  scanLogId: number,
  scanWindowDays: number,
  useKeywords: boolean,
  useNaics: boolean
): Promise<void> {
  const config = await getConfig();
  const apiKey = process.env["SAM_API_KEY"] ?? config["sam_api_key"] ?? "";
  const matchThreshold = parseFloat(config["match_threshold"] ?? "0.4");
  const searchKeywords: string[] = JSON.parse(config["search_keywords"] ?? "[]");
  const naicsCodes: string[] = JSON.parse(config["naics_codes"] ?? "[]");

  const now = new Date();
  const from = new Date(now.getTime() - scanWindowDays * 24 * 60 * 60 * 1000);
  const postedFrom = formatDate(from);
  const postedTo = formatDate(now);

  const logLines: string[] = [];

  async function appendLog(msg: string): Promise<void> {
    const line = `[${new Date().toISOString().substring(11, 19)}] ${msg}`;
    logLines.push(line);
    logger.info(msg);

    await db
      .update(scanLogsTable)
      .set({ progressLog: logLines.join("\n") })
      .where(eq(scanLogsTable.id, scanLogId));
  }

  try {
    await appendLog(`Starting scan: window=${scanWindowDays} days, keywords=${useKeywords}, naics=${useNaics}`);

    if (!apiKey) {
      await appendLog("ERROR: SAM_API_KEY not configured. Aborting scan.");
      await db
        .update(scanLogsTable)
        .set({ status: "failed", completedAt: new Date(), errorMessage: "SAM_API_KEY not configured" })
        .where(eq(scanLogsTable.id, scanLogId));
      return;
    }

    const watchlistEntries = await db.select().from(watchlistEntriesTable);
    await appendLog(`Loaded ${watchlistEntries.length} watchlist entries`);

    const allOpportunities = new Map<string, SamOpportunity>();

    if (useKeywords && searchKeywords.length > 0) {
      await appendLog(`Keyword search: ${searchKeywords.length} keywords`);
      for (const keyword of searchKeywords) {
        await appendLog(`  Searching keyword: "${keyword}"`);
        const opps = await fetchSamOpportunities(
          { title: keyword, postedFrom, postedTo },
          apiKey,
          appendLog
        );
        for (const opp of opps) {
          if (opp.noticeId) allOpportunities.set(opp.noticeId, opp);
        }
      }
    }

    if (useNaics && naicsCodes.length > 0) {
      await appendLog(`NAICS search: codes ${naicsCodes.join(",")}`);
      const opps = await fetchSamOpportunities(
        { ncode: naicsCodes.join(","), postedFrom, postedTo },
        apiKey,
        appendLog
      );
      for (const opp of opps) {
        if (opp.noticeId) allOpportunities.set(opp.noticeId, opp);
      }
    }

    const totalOpportunities = allOpportunities.size;
    await appendLog(`Total unique opportunities after dedup: ${totalOpportunities}`);

    const existingNoticeIds = await db
      .select({ noticeId: alertsTable.noticeId })
      .from(alertsTable)
      .where(
        inArray(
          alertsTable.noticeId,
          Array.from(allOpportunities.keys()).filter((k) => k !== "")
        )
      );
    const existingSet = new Set(existingNoticeIds.map((r) => r.noticeId));

    await appendLog(`Running matching engine...`);
    const newAlerts: InsertAlert[] = [];

    for (const [noticeId, opp] of allOpportunities.entries()) {
      if (existingSet.has(noticeId)) continue;

      const oppText = [
        opp.title ?? "",
        opp.description ?? "",
        opp.fullParentPathName ?? "",
        opp.organizationName ?? "",
      ].join(" ");

      for (const entry of watchlistEntries) {
        const searchTerms = (entry.searchTerms as string[]) ?? [];
        const score = scoreMatch(oppText, searchTerms, searchKeywords);

        if (score >= matchThreshold) {
          newAlerts.push({
            source: "SAM.gov",
            agencyMatchId: entry.id,
            watchlistAgency: entry.agency,
            opportunityTitle: opp.title ?? "",
            solicitationNumber: opp.solicitationNumber ?? "",
            postedDate: opp.postedDate ?? "",
            responseDeadline: opp.responseDeadLine ?? "",
            url: opp.uiLink ?? `https://sam.gov/opp/${noticeId}/view`,
            matchScore: String(score.toFixed(4)),
            watchlistTcv: entry.tcv ?? "0",
            watchlistPriority: entry.priority,
            noticeId: noticeId,
            notes: "",
            timestamp: new Date(),
          });
        }
      }
    }

    await appendLog(`Found ${newAlerts.length} new matching alerts`);

    if (newAlerts.length > 0) {
      await db.insert(alertsTable).values(newAlerts);
    }

    await db
      .update(scanLogsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        totalOpportunities,
        totalAlerts: newAlerts.length,
        progressLog: [...logLines, `[${new Date().toISOString().substring(11, 19)}] Scan completed successfully`].join("\n"),
      })
      .where(eq(scanLogsTable.id, scanLogId));

    logger.info({ scanLogId, totalOpportunities, newAlerts: newAlerts.length }, "Scan completed");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await appendLog(`FATAL ERROR: ${msg}`);
    await db
      .update(scanLogsTable)
      .set({ status: "failed", completedAt: new Date(), errorMessage: msg })
      .where(eq(scanLogsTable.id, scanLogId));
    logger.error({ err, scanLogId }, "Scan failed");
  }
}
