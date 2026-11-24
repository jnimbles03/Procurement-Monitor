/**
 * Drives the real watchlist import route. The database insert is replaced
 * so the assertions observe the parser, which runs before that insert.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import importRouter from "../src/routes/import.ts";
import { requireAuth } from "../src/middlewares/requireAuth.ts";
import { db } from "@workspace/db";

export type ImportCase = {
  name: string;
  filename: string;
  contentType: string;
  body: Buffer;
  authenticate: boolean;
  /** When set, the route must finish and report this imported row count. */
  imported?: number;
  agency?: string;
};

export type ImportCaseResult = {
  status: number;
  body: unknown;
  addedKeys: string[];
  elapsedMs: number;
};

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function fixture(name: string): Buffer {
  const dir = process.env.IMPORT_SECURITY_FIXTURES;
  if (!dir) throw new Error("IMPORT_SECURITY_FIXTURES is not set");
  return readFileSync(`${dir}/${name}`);
}

function benignCsv(): Buffer {
  return Buffer.from("Agency,State\nCity Hall,TX\n", "utf8");
}

/**
 * Hits the quadratic replacement in SheetJS 0.18.5 `fuzzynum`
 * (`/[(](.*)[)]/`). A digit keeps the function from returning early.
 * 200_000 parentheses is still far under the 10 MB upload limit and
 * takes tens of seconds on 0.18.5; the patched `[^()]*` form returns
 * immediately.
 */
function slowCell(): Buffer {
  return Buffer.from("(".repeat(200_000) + "1", "utf8");
}

export function cases(): ImportCase[] {
  const polluted = fixture("comment-ref-proto.xlsx");
  const slow = slowCell();
  return [
    {
      name: "authenticated xlsx comment does not change Object.prototype",
      filename: "watchlist.xlsx",
      contentType: XLSX_MIME,
      body: polluted,
      authenticate: true,
      imported: 1,
      agency: "Example Agency",
    },
    {
      name: "xls extension reaches the same parser and does not change Object.prototype",
      filename: "watchlist.xls",
      contentType: "application/octet-stream",
      body: polluted,
      authenticate: true,
      imported: 1,
      agency: "Example Agency",
    },
    {
      name: "csv extension reaches the same parser and does not change Object.prototype",
      filename: "watchlist.csv",
      contentType: "application/octet-stream",
      body: polluted,
      authenticate: true,
      imported: 1,
      agency: "Example Agency",
    },
    {
      name: "extension check is case-insensitive and still does not change Object.prototype",
      filename: "watchlist.XLSX",
      contentType: "application/octet-stream",
      body: polluted,
      authenticate: true,
      imported: 1,
      agency: "Example Agency",
    },
    {
      name: "allowed spreadsheet content type reaches the parser without a spreadsheet extension",
      filename: "upload.txt",
      contentType: XLSX_MIME,
      body: polluted,
      authenticate: true,
      imported: 1,
      agency: "Example Agency",
    },
    {
      name: "xlsx upload of a slow cell returns without changing Object.prototype",
      filename: "watchlist.xlsx",
      contentType: "application/octet-stream",
      body: slow,
      authenticate: true,
    },
    {
      name: "xls upload of a slow cell returns without changing Object.prototype",
      filename: "watchlist.xls",
      contentType: "application/octet-stream",
      body: slow,
      authenticate: true,
    },
    {
      name: "csv upload of a slow cell returns without changing Object.prototype",
      filename: "watchlist.csv",
      contentType: "text/csv",
      body: slow,
      authenticate: true,
    },
    {
      name: "benign xlsx import still returns the agency row",
      filename: "watchlist.xlsx",
      contentType: XLSX_MIME,
      body: fixture("benign.xlsx"),
      authenticate: true,
      imported: 1,
      agency: "City Hall",
    },
    {
      name: "benign csv import still returns the agency row",
      filename: "watchlist.csv",
      contentType: "text/csv",
      body: benignCsv(),
      authenticate: true,
      imported: 1,
      agency: "City Hall",
    },
    {
      name: "anonymous upload is refused before the parser runs",
      filename: "watchlist.xlsx",
      contentType: XLSX_MIME,
      body: polluted,
      authenticate: false,
    },
    {
      name: "disallowed extension and content type are refused before the parser runs",
      filename: "notes.txt",
      contentType: "text/plain",
      body: polluted,
      authenticate: true,
    },
  ];
}

function multipart(filename: string, contentType: string, body: Buffer): { payload: Buffer; boundary: string } {
  const boundary = "----importsecurityboundary";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return { payload: Buffer.concat([head, body, tail]), boundary };
}

function cookiePair(res: globalThis.Response): string {
  const cookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return cookies.map((line) => line.split(";")[0]).join("; ");
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return address.port;
}

export async function exercise(testCase: ImportCase): Promise<ImportCaseResult> {
  const inserted: unknown[] = [];
  (db as unknown as { insert: (table: unknown) => unknown }).insert = () => ({
    values(rows: unknown[]) {
      inserted.splice(0, inserted.length, ...rows);
      return {
        returning: async () => rows.map((row, index) => ({ id: index + 1, ...(row as object) })),
      };
    },
  });

  const app = express();
  app.use(cookieParser());
  app.use(
    session({
      secret: "test-only-session",
      resave: false,
      saveUninitialized: false,
    }),
  );
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { log: { error: (...args: unknown[]) => void } }).log = { error() {} };
    next();
  });
  app.post("/__test/session", (req: Request, res: Response) => {
    req.session.userEmail = "analyst@docusign.com";
    req.session.save(() => {
      res.end("ok");
    });
  });

  const api = express.Router();
  api.use(requireAuth);
  api.use(importRouter);
  app.use("/api", api);

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  try {
    let cookie = "";
    if (testCase.authenticate) {
      const login = await fetch(`${origin}/__test/session`, { method: "POST" });
      cookie = cookiePair(login);
      if (!cookie) throw new Error("session cookie was not set");
    }

    const before = new Set(Object.getOwnPropertyNames(Object.prototype));
    const { payload, boundary } = multipart(testCase.filename, testCase.contentType, testCase.body);
    const started = Date.now();
    const response = await fetch(`${origin}/api/watchlist/import`, {
      method: "POST",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        ...(cookie ? { cookie } : {}),
      },
      body: payload,
    });
    const elapsedMs = Date.now() - started;
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* leave the raw body */
    }
    const addedKeys = Object.getOwnPropertyNames(Object.prototype).filter((key) => !before.has(key));
    for (const key of addedKeys) {
      delete (Object.prototype as Record<string, unknown>)[key];
    }
    return { status: response.status, body, addedKeys, elapsedMs };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const kind = process.argv[2];
if (kind != null && kind !== "") {
  const testCase = cases().find((item) => item.name === kind);
  if (!testCase) {
    process.stderr.write(`unknown case ${kind}\n`);
    process.exit(2);
  }
  exercise(testCase)
    .then((result) => {
      process.stdout.write(JSON.stringify(result));
      process.exit(0);
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.stack ?? err.message : String(err);
      process.stdout.write(JSON.stringify({ error: message }));
      process.exit(1);
    });
}
