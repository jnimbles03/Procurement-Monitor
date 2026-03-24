import axios from "axios";
import { db } from "@workspace/db";
import { watchlistEntriesTable, type WatchlistEntry } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const USA_SPENDING_BASE = "https://api.usaspending.gov/api/v2";

const GLOBAL_KEYWORDS = [
  "electronic signature",
  "esignature",
  "e-signature",
  "digital signature",
  "contract lifecycle management",
  "contract management",
  "document management",
];

interface USASpendingSearchResult {
  internal_id: number;
  "Award ID": string;
  "Recipient Name": string;
  "Awarding Agency": string;
  "Awarding Sub Agency": string;
  "Award Amount": number;
  Description: string;
  generated_internal_id: string;
}

interface USASpendingSearchResponse {
  results?: USASpendingSearchResult[];
}

interface AwardDetail {
  period_of_performance?: {
    start_date: string | null;
    end_date: string | null;
    potential_end_date: string | null;
  };
  award_amount?: number;
}

async function fetchAwardDetail(generatedId: string): Promise<AwardDetail | null> {
  try {
    const resp = await axios.get<AwardDetail>(`${USA_SPENDING_BASE}/awards/${encodeURIComponent(generatedId)}/`, {
      timeout: 8000,
    });
    return resp.data;
  } catch {
    return null;
  }
}

function buildKeywords(entry: WatchlistEntry): string[] {
  const terms = (entry.searchTerms as string[]) ?? [];
  const combined = [...terms, ...GLOBAL_KEYWORDS];
  return [...new Set(combined)].slice(0, 10);
}

function competitorToRecipient(competitor: string): string | null {
  const map: Record<string, string> = {
    Adobe: "Adobe",
    DocuSign: "DocuSign",
    OpenText: "OpenText",
    Hyland: "Hyland",
    Laserfiche: "Laserfiche",
  };
  return map[competitor] ?? null;
}

export interface USASpendingLookupResult {
  found: boolean;
  awardId?: string;
  recipient?: string;
  description?: string;
  awardingAgency?: string;
  contractEnd?: string;
  potentialEnd?: string;
  amount?: number;
}

export async function lookupUSASpending(entry: WatchlistEntry): Promise<USASpendingLookupResult> {
  try {
    const keywords = buildKeywords(entry);
    const recipient = competitorToRecipient(entry.competitor);

    const payload: Record<string, unknown> = {
      filters: {
        keywords,
        award_type_codes: ["A", "B", "C", "D"],
        time_period: [{ start_date: "2015-01-01", end_date: "2030-12-31" }],
      },
      fields: [
        "Award ID",
        "Recipient Name",
        "Awarding Agency",
        "Awarding Sub Agency",
        "Award Amount",
        "Description",
        "generated_internal_id",
      ],
      page: 1,
      limit: 10,
      sort: "Award Amount",
      order: "desc",
      subawards: false,
    };

    if (recipient) {
      (payload.filters as Record<string, unknown>).recipient_search_text = [recipient];
    }

    const resp = await axios.post<USASpendingSearchResponse>(
      `${USA_SPENDING_BASE}/search/spending_by_award/`,
      payload,
      { timeout: 12000 }
    );

    const results = resp.data.results ?? [];
    if (results.length === 0) return { found: false };

    const agencyNormalized = entry.agency.toLowerCase();

    const ranked = results.map((r) => {
      const agencyMatch =
        r["Awarding Agency"]?.toLowerCase().includes(agencyNormalized.split(" ")[0] ?? "") ||
        r["Awarding Sub Agency"]?.toLowerCase().includes(agencyNormalized.split(" ")[0] ?? "")
          ? 2
          : 0;
      return { r, score: agencyMatch };
    });
    ranked.sort((a, b) => b.score - a.score);

    const best = ranked[0]!.r;
    const detail = await fetchAwardDetail(best.generated_internal_id);

    return {
      found: true,
      awardId: best["Award ID"],
      recipient: best["Recipient Name"],
      description: best.Description?.slice(0, 200),
      awardingAgency: best["Awarding Sub Agency"] || best["Awarding Agency"],
      contractEnd: detail?.period_of_performance?.end_date ?? undefined,
      potentialEnd:
        detail?.period_of_performance?.potential_end_date?.split(" ")[0] ??
        detail?.period_of_performance?.end_date ??
        undefined,
      amount: best["Award Amount"],
    };
  } catch (err) {
    logger.warn({ err, agency: entry.agency }, "USASpending lookup failed");
    return { found: false };
  }
}

export async function enrichAllEntries(): Promise<{ enriched: number; notFound: number }> {
  const entries = await db.select().from(watchlistEntriesTable);
  let enriched = 0;
  let notFound = 0;

  for (const entry of entries) {
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
      .where(eq(watchlistEntriesTable.id, entry.id));

    if (result.found) {
      enriched++;
      logger.info({ agency: entry.agency, awardId: result.awardId, potentialEnd: result.potentialEnd }, "USASpending match found");
    } else {
      notFound++;
      logger.info({ agency: entry.agency }, "No USASpending match");
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  return { enriched, notFound };
}
