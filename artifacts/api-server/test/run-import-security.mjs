import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiServer = path.resolve(here, "..");
const fixtures = path.join(here, "fixtures");
const outdir = path.join(here, ".generated");
mkdirSync(outdir, { recursive: true });
const bundlePath = path.join(outdir, "import-security-cases.cjs");
const requireApi = createRequire(path.join(apiServer, "package.json"));
const requireDb = createRequire(path.resolve(apiServer, "../../lib/db/package.json"));

function resolveInstalled(spec) {
  try {
    return requireApi.resolve(spec);
  } catch {
    return requireDb.resolve(spec);
  }
}

await esbuild.build({
  absWorkingDir: apiServer,
  entryPoints: [path.join(here, "import-security-cases.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: bundlePath,
  alias: {
    "@workspace/db": path.resolve(apiServer, "../../lib/db/src/index.ts"),
  },
  plugins: [
    {
      name: "external-installed-packages",
      setup(build) {
        build.onResolve({ filter: /^(express|express-session|cookie-parser|multer|xlsx|pg|drizzle-orm|zod)(\/.*)?$/ }, (args) => {
          return { path: resolveInstalled(args.path), external: true };
        });
      },
    },
  ],
});

const RETURN_BUDGET_MS = 3_000;

function runCase(name) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bundlePath, name], {
      cwd: apiServer,
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL || "postgres://127.0.0.1:1/unused",
        IMPORT_SECURITY_FIXTURES: fixtures,
      },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ timedOut: true, stdout, stderr });
    }, RETURN_BUDGET_MS);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("exit", (code) => {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        parsed = null;
      }
      finish({ timedOut: false, code, parsed, stdout, stderr });
    });
  });
}

function assertReturned(result, name) {
  assert.equal(
    result.timedOut,
    false,
    `${name} did not return within ${RETURN_BUDGET_MS}ms. stdout=${result.stdout} stderr=${result.stderr}`,
  );
  assert.equal(
    result.code,
    0,
    `${name} exited ${result.code}. stdout=${result.stdout} stderr=${result.stderr}`,
  );
  assert.ok(result.parsed && !result.parsed.error, result.parsed?.error ?? result.stderr);
  assert.deepEqual(
    result.parsed.addedKeys,
    [],
    `${name} added Object.prototype keys ${JSON.stringify(result.parsed.addedKeys)}`,
  );
}

const expectations = [
  {
    name: "authenticated xlsx comment does not change Object.prototype",
    imported: 1,
    agency: "Example Agency",
    status: 200,
  },
  {
    name: "xls extension reaches the same parser and does not change Object.prototype",
    imported: 1,
    agency: "Example Agency",
    status: 200,
  },
  {
    name: "csv extension reaches the same parser and does not change Object.prototype",
    imported: 1,
    agency: "Example Agency",
    status: 200,
  },
  {
    name: "extension check is case-insensitive and still does not change Object.prototype",
    imported: 1,
    agency: "Example Agency",
    status: 200,
  },
  {
    name: "allowed spreadsheet content type reaches the parser without a spreadsheet extension",
    imported: 1,
    agency: "Example Agency",
    status: 200,
  },
  {
    name: "xlsx upload of a slow cell returns without changing Object.prototype",
  },
  {
    name: "xls upload of a slow cell returns without changing Object.prototype",
  },
  {
    name: "csv upload of a slow cell returns without changing Object.prototype",
  },
  {
    name: "benign xlsx import still returns the agency row",
    imported: 1,
    agency: "City Hall",
    status: 200,
  },
  {
    name: "benign csv import still returns the agency row",
    imported: 1,
    agency: "City Hall",
    status: 200,
  },
  {
    name: "anonymous upload is refused before the parser runs",
    status: 401,
  },
  {
    name: "disallowed extension and content type are refused before the parser runs",
    status: 400,
  },
];

for (const expected of expectations) {
  test(expected.name, { timeout: 20_000 }, async () => {
    const result = await runCase(expected.name);
    assertReturned(result, expected.name);
    if (expected.status != null) {
      assert.equal(result.parsed.status, expected.status, JSON.stringify(result.parsed));
    } else {
      assert.equal(typeof result.parsed.status, "number");
    }
    if (expected.imported != null) {
      assert.equal(result.parsed.body?.imported, expected.imported, JSON.stringify(result.parsed.body));
      assert.equal(result.parsed.body?.entries?.[0]?.agency, expected.agency);
    }
  });
}

test.after(() => {
  rmSync(outdir, { recursive: true, force: true });
});
