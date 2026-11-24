/**
 * Spec for the committed SAM.gov API key.
 *
 * These tests fail while a usable key is stored in the repository and pass
 * once that literal is gone. They never embed the credential.
 *
 * The scanner reads SAM_API_KEY from the environment, then config.sam_api_key,
 * and Axios (the version pinned in the lockfile) appends it as the api_key
 * query parameter on GET https://api.sam.gov/opportunities/v2/search.
 * POST /api/scan and the daily scheduler both call this same runScan function.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import { mock, test } from "node:test";

process.env.NODE_ENV = "production";
process.env.LOG_LEVEL = "silent";
process.env.DATABASE_URL ??= "postgres://127.0.0.1:1/none";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const PLACEHOLDER_KEY = "test-sam-key-placeholder";

type Hit = { file: string; line: number; value: string };
type Captured = { host: string; path: string; apiKey: string | null };

const state: {
  configRows: { key: string; value: string }[];
  watchlistRows: unknown[];
  updates: { progressLog?: string; status?: string; errorMessage?: string }[];
} = {
  configRows: [],
  watchlistRows: [],
  updates: [],
};

function rowsFor(table: { __table?: string } | undefined): unknown[] {
  if (table?.__table === "config") return state.configRows;
  if (table?.__table === "watchlist") return state.watchlistRows;
  return [];
}

mock.module("@workspace/db", {
  namedExports: {
    db: {
      select() {
        return {
          from(table: { __table?: string }) {
            const query = {
              where() {
                return query;
              },
              then(onFulfilled: (rows: unknown[]) => unknown, onRejected?: (err: unknown) => unknown) {
                return Promise.resolve(rowsFor(table)).then(onFulfilled, onRejected);
              },
            };
            return query;
          },
        };
      },
      update() {
        return {
          set(values: { progressLog?: string; status?: string; errorMessage?: string }) {
            return {
              where() {
                state.updates.push(values);
                return Promise.resolve();
              },
            };
          },
        };
      },
      insert() {
        return {
          values() {
            return Promise.resolve();
          },
        };
      },
    },
    configTable: { __table: "config" },
    watchlistEntriesTable: { __table: "watchlist" },
    alertsTable: { __table: "alerts", noticeId: "noticeId" },
    scanLogsTable: { __table: "scanLogs", id: "id" },
  },
});

const { runScan } = await import("../src/services/samScanner.ts");

function isPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  // Credentials are a single token. Sentences and CSS class lists are not.
  if (trimmed.length < 20 || /\s/.test(trimmed)) return true;
  if (!/^[A-Za-z0-9._:+/=-]+$/.test(trimmed)) return true;
  if (/^(?:SAM_API_KEY|sam_api_key)$/.test(trimmed)) return true;
  if (/^\$\{[^}]+\}$/.test(trimmed) || /^<[^>]+>$/.test(trimmed)) return true;
  if (/placeholder|example|changeme|your[_-]?api[_-]?key|redacted|dummy|sample/i.test(trimmed)) {
    return true;
  }
  if (!/[A-Za-z]/.test(trimmed) || !/[0-9]/.test(trimmed)) return true;
  return false;
}

function lineOf(text: string, value: string): number {
  const lines = text.split(/\n/);
  const index = lines.findIndex((line) => line.includes(value));
  return index === -1 ? 1 : index + 1;
}

function consider(hits: Hit[], file: string, text: string, value: string): void {
  if (isPlaceholder(value)) return;
  const line = lineOf(text, value);
  if (hits.some((hit) => hit.file === file && hit.line === line && hit.value === value)) return;
  hits.push({ file, line, value });
}

function walkJson(node: unknown, file: string, text: string, hits: Hit[]): void {
  if (Array.isArray(node)) {
    for (const entry of node) walkJson(entry, file, text, hits);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (/^sam_api_key$/i.test(key) && typeof value === "string") {
      consider(hits, file, text, value);
    } else {
      walkJson(value, file, text, hits);
    }
  }
}

function findCommittedSamKeys(): Hit[] {
  const listed = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" });
  const hits: Hit[] = [];
  const self = path.relative(repoRoot, path.resolve(import.meta.dirname, "sam-api-key-exposure.test.ts"));

  for (const rel of listed.split("\0")) {
    if (!rel || rel === self) continue;
    if (/\.(png|jpe?g|gif|webp|pdf|xlsx|xls|woff2?|ico)$/i.test(rel)) continue;
    const abs = path.join(repoRoot, rel);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > 1_000_000) continue;
    const text = fs.readFileSync(abs, "utf8");
    if (text.includes("\0")) continue;

    if (rel.endsWith(".json")) {
      try {
        walkJson(JSON.parse(text), rel, text, hits);
      } catch {
        // Not JSON; fall through to text patterns.
      }
    }

    const assignment =
      /(?:SAM_API_KEY|sam_api_key)\s*[=:]\s*(?:"([^"\\\n]+)"|'([^'\\\n]+)'|`([^`\\\n]+)`)/g;
    for (const match of text.matchAll(assignment)) {
      const value = match[1] ?? match[2] ?? match[3] ?? "";
      const line = text.slice(0, match.index ?? 0).split(/\n/).length;
      if (!isPlaceholder(value)) {
        if (!hits.some((hit) => hit.file === rel && hit.line === line && hit.value === value)) {
          hits.push({ file: rel, line, value });
        }
      }
    }

    for (const match of text.matchAll(/\bSAM-[0-9a-fA-F-]{20,}\b/g)) {
      consider(hits, rel, text, match[0]);
    }

    const lines = text.split(/\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (!/sam_api_key/i.test(line)) continue;
      for (const match of line.matchAll(/"([^"\n]+)"|'([^'\n]+)'|`([^`\n]+)`/g)) {
        consider(hits, rel, text, match[1] ?? match[2] ?? match[3] ?? "");
      }
    }
  }

  return hits;
}

function readSharedUserEnv(replitSource: string): Record<string, string> {
  const env: Record<string, string> = {};
  let inShared = false;
  for (const raw of replitSource.split(/\n/)) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      inShared = trimmed === "[userenv.shared]";
      continue;
    }
    if (!inShared || !trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(.*))$/.exec(trimmed);
    if (!match) continue;
    env[match[1] ?? ""] = match[2] ?? match[3] ?? (match[4] ?? "").trim();
  }
  return env;
}

class FakeRequest extends EventEmitter {
  destroyed = false;
  finished = false;
  constructor(private readonly onResponse: (res: Readable & { statusCode: number; headers: Record<string, string> }) => void, private readonly status: number, private readonly body: string) {
    super();
  }
  write(_data?: unknown, encoding?: unknown, cb?: unknown): boolean {
    const done = typeof encoding === "function" ? encoding : cb;
    if (typeof done === "function") done();
    return true;
  }
  end(_data?: unknown, encoding?: unknown, cb?: unknown): this {
    const done = typeof _data === "function" ? _data : typeof encoding === "function" ? encoding : cb;
    this.finished = true;
    const payload = Buffer.from(this.body);
    const res = Readable.from([payload]) as Readable & { statusCode: number; headers: Record<string, string>; statusMessage?: string };
    res.statusCode = this.status;
    res.statusMessage = this.status === 200 ? "OK" : "Too Many Requests";
    res.headers = {
      "content-type": "application/json",
      "content-length": String(payload.length),
    };
    this.onResponse(res);
    if (typeof done === "function") done();
    return this;
  }
  setHeader(): void {}
  removeHeader(): void {}
  abort(): void {
    this.destroyed = true;
  }
  destroy(): this {
    this.destroyed = true;
    return this;
  }
  setTimeout(): this {
    return this;
  }
}

async function captureSamRequests(
  status: number,
  body: unknown,
  run: () => Promise<void>,
): Promise<Captured[]> {
  const captured: Captured[] = [];
  const original = https.request;
  https.request = function patched(options: https.RequestOptions, callback?: (res: unknown) => void) {
    const host = String(options.hostname ?? options.host ?? "");
    const fullPath = String(options.path ?? "/");
    const query = fullPath.includes("?") ? fullPath.slice(fullPath.indexOf("?") + 1) : "";
    const pathname = fullPath.includes("?") ? fullPath.slice(0, fullPath.indexOf("?")) : fullPath;
    captured.push({
      host,
      path: pathname,
      apiKey: new URLSearchParams(query).get("api_key"),
    });
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    return new FakeRequest((res) => callback?.(res), status, payload) as unknown as ReturnType<typeof https.request>;
  } as typeof https.request;

  try {
    await run();
    return captured;
  } finally {
    https.request = original;
  }
}

function baseConfig(): { key: string; value: string }[] {
  return [
    { key: "search_keywords", value: JSON.stringify(["radar"]) },
    { key: "naics_codes", value: "[]" },
    { key: "match_threshold", value: "0.4" },
  ];
}

function locations(hits: Hit[]): string {
  return hits.map((hit) => `${hit.file}:${hit.line}`).join(", ");
}

test("committed files do not contain a SAM.gov API key literal", () => {
  const hits = findCommittedSamKeys();
  assert.equal(
    hits.length,
    0,
    `committed SAM API key literal at ${locations(hits)}`,
  );
});

test("scanner does not send a .replit userenv SAM_API_KEY to api.sam.gov", async () => {
  const hits = findCommittedSamKeys();
  const previous = process.env.SAM_API_KEY;
  delete process.env.SAM_API_KEY;
  const shared = readSharedUserEnv(fs.readFileSync(path.join(repoRoot, ".replit"), "utf8"));
  if (shared.SAM_API_KEY && !isPlaceholder(shared.SAM_API_KEY)) {
    process.env.SAM_API_KEY = shared.SAM_API_KEY;
  }
  state.configRows = baseConfig();
  state.watchlistRows = [];
  state.updates = [];

  try {
    const seen = await captureSamRequests(200, { opportunitiesData: [], totalRecords: 0 }, () =>
      runScan(1, 1, true, false),
    );
    const committed = new Set(hits.map((hit) => hit.value));
    const leaked = seen.some((request) => request.apiKey != null && committed.has(request.apiKey));
    for (const request of seen) {
      assert.equal(request.host, "api.sam.gov");
      assert.equal(request.path, "/opportunities/v2/search");
    }
    assert.equal(leaked, false, "scanner transmitted a SAM API key that is committed in the repository");
  } finally {
    if (previous === undefined) delete process.env.SAM_API_KEY;
    else process.env.SAM_API_KEY = previous;
  }
});

test("scanner does not send config.sam_api_key when that value is committed", async () => {
  const hits = findCommittedSamKeys();
  const previous = process.env.SAM_API_KEY;
  delete process.env.SAM_API_KEY;
  const jsonHit = hits.find((hit) => hit.file.endsWith(".json"));
  state.configRows = baseConfig();
  if (jsonHit) state.configRows.push({ key: "sam_api_key", value: jsonHit.value });
  state.watchlistRows = [];
  state.updates = [];

  try {
    const seen = await captureSamRequests(200, { opportunitiesData: [], totalRecords: 0 }, () =>
      runScan(2, 1, true, false),
    );
    const committed = new Set(hits.map((hit) => hit.value));
    const leaked = seen.some((request) => request.apiKey != null && committed.has(request.apiKey));
    for (const request of seen) {
      assert.equal(request.host, "api.sam.gov");
      assert.equal(request.path, "/opportunities/v2/search");
    }
    assert.equal(leaked, false, "scanner transmitted config.sam_api_key from a committed config file");
  } finally {
    if (previous === undefined) delete process.env.SAM_API_KEY;
    else process.env.SAM_API_KEY = previous;
  }
});

test("placeholder SAM_API_KEY is sent to the opportunities search and a 429 query stops after 3 retries", async (t) => {
  const hits = findCommittedSamKeys();
  const previous = process.env.SAM_API_KEY;
  process.env.SAM_API_KEY = PLACEHOLDER_KEY;
  state.configRows = baseConfig();
  state.watchlistRows = [];
  state.updates = [];
  t.mock.timers.enable({ apis: ["setTimeout"] });

  let settled = false;
  try {
    const seenPromise = captureSamRequests(429, { message: "rate limit" }, async () => {
      await runScan(3, 1, true, false);
    });
    const wait = seenPromise.finally(() => {
      settled = true;
    });
    for (let i = 0; i < 30 && !settled; i++) {
      await new Promise((resolve) => setImmediate(resolve));
      t.mock.timers.tick(60_000);
    }
    const seen = await wait;
    const committed = new Set(hits.map((hit) => hit.value));
    const usedPlaceholder = seen.length === 4 && seen.every((request) => request.apiKey === PLACEHOLDER_KEY);
    const onSearch = seen.every((request) => request.host === "api.sam.gov" && request.path === "/opportunities/v2/search");
    const gaveUp = state.updates.some((update) => (update.progressLog ?? "").includes("exceeded 3 retries"));
    const leaked = seen.some((request) => request.apiKey != null && committed.has(request.apiKey));
    assert.equal(usedPlaceholder, true, "scanner did not send the placeholder key on exactly 4 attempts");
    assert.equal(onSearch, true, "scanner did not call the SAM.gov opportunities search endpoint");
    assert.equal(gaveUp, true, "scanner did not stop the query after 3 rate-limit retries");
    assert.equal(leaked, false, "placeholder run transmitted a committed SAM API key");
  } finally {
    t.mock.timers.reset();
    if (previous === undefined) delete process.env.SAM_API_KEY;
    else process.env.SAM_API_KEY = previous;
  }
});
