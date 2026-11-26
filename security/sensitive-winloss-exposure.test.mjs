/**
 * Spec for the public-repo win/loss exposure.
 *
 * These tests fail while the lost-deal records are still in the tree a
 * clone checks out, and pass once those records are gone from tracked
 * files. They read the git blobs (what `git clone` materializes) and the
 * array actually passed to the watchlist insert.
 *
 * Run: node --test security/sensitive-winloss-exposure.test.mjs
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const thisTest = "security/sensitive-winloss-exposure.test.mjs";

/** Strings that identify the real lost-deal export, not a placeholder row. */
const DEAL_MARKERS = [
  "Citizens Property Insurance",
  "Land Registers of Northern Ireland",
  "US Courts Defender Service Division",
  "Pôle Emploi",
  "Pole Emploi",
  "704062",
  "2335823",
  "321177",
  "606500",
  "Overall Win Rate",
  "TCV Lost",
  "Total Contract Value (converted)",
  "Account Executive: Full Name",
  "Loss Notes",
  "(Raw) Win Loss Report",
  "Win Loss Data",
];

function git(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function trackedFiles() {
  const out = git(["ls-files", "-z"]);
  return out.split("\0").filter(Boolean);
}

function gitShow(relPath) {
  return git(["show", `HEAD:${relPath}`]);
}

function ignoresAttachedAssets(text) {
  return text.split("\n").some((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) return false;
    return (
      trimmed === "attached_assets" ||
      trimmed === "attached_assets/" ||
      trimmed === "/attached_assets" ||
      trimmed === "/attached_assets/" ||
      trimmed === "attached_assets/**" ||
      trimmed === "/attached_assets/**"
    );
  });
}

function extractConstArray(source, name) {
  const decl = source.indexOf(`const ${name} =`);
  assert.notEqual(decl, -1, `expected const ${name} in the seed source`);
  const start = source.indexOf("[", decl);
  assert.notEqual(start, -1, `expected array for ${name}`);
  let depth = 0;
  let end = -1;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  assert.notEqual(end, -1, `unterminated array for ${name}`);
  const arrayText = source.slice(start, end + 1);
  const records = Function(`"use strict"; return (${arrayText});`)();
  assert.ok(Array.isArray(records), `${name} did not evaluate to an array`);
  return records;
}

function insertPayloadName(source) {
  const compact = source.replace(/\s+/g, "");
  const match = compact.match(/insert\(watchlistEntriesTable\)\.values\(([A-Za-z0-9_]+)\)/);
  assert.ok(match, "watchlist insert must pass a named array to .values()");
  return match[1];
}

function assertNoDealMarkers(text, label) {
  const hits = DEAL_MARKERS.filter((marker) => text.includes(marker));
  assert.deepEqual(hits, [], `${label} still contains lost-deal markers: ${hits.join(", ")}`);
}

function pythonWatchlist(source) {
  const script = `
import ast, json, sys
mod = ast.parse(sys.stdin.read())
found = None
for node in mod.body:
    if isinstance(node, ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == "WATCHLIST":
                found = ast.literal_eval(node.value)
if found is None:
    raise SystemExit("WATCHLIST assignment not found")
json.dump(found, sys.stdout)
`;
  const out = execFileSync("python3", ["-c", script], {
    cwd: repoRoot,
    input: source,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const records = JSON.parse(out);
  assert.ok(Array.isArray(records));
  return records;
}

function workbookMarkerHits(xlsxBytes) {
  const dir = mkdtempSync(path.join(tmpdir(), "winloss-"));
  const file = path.join(dir, "book.xlsx");
  try {
    writeFileSync(file, xlsxBytes);
    const script = `
import sys, zipfile
path, needles = sys.argv[1], sys.argv[2:]
hits = []
with zipfile.ZipFile(path) as book:
    names = set(book.namelist())
    targets = [n for n in names if n.endswith("sharedStrings.xml") or n.endswith("workbook.xml")]
    assert targets, "workbook has no shared strings or workbook part"
    for name in targets:
        data = book.read(name)
        for needle in needles:
            if needle.encode() in data:
                hits.append(needle)
print("\\n".join(sorted(set(hits))))
`;
    return execFileSync("python3", ["-c", script, file, ...DEAL_MARKERS], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    })
      .split("\n")
      .filter(Boolean);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a clone does not track attached_assets", () => {
  const tracked = trackedFiles().filter((file) => file === "attached_assets" || file.startsWith("attached_assets/"));
  assert.deepEqual(
    tracked,
    [],
    "attached_assets is still in the tree a clone checks out:\n" + tracked.join("\n"),
  );
});

test("gitignore and replitignore ignore attached_assets", () => {
  for (const file of [".gitignore", ".replitignore"]) {
    const text = gitShow(file);
    assert.equal(
      ignoresAttachedAssets(text),
      true,
      `${file} does not ignore attached_assets`,
    );
  }
});

test("tracked text does not contain the lost-deal watchlist or GPM export labels", () => {
  let output = "";
  try {
    output = git([
      "grep",
      "-F",
      "-n",
      "-I",
      ...DEAL_MARKERS.flatMap((marker) => ["-e", marker]),
      "--",
      ".",
      `:(exclude)${thisTest}`,
    ]);
  } catch (err) {
    // git grep exits 1 when nothing matches.
    if (err && err.status === 1) return;
    throw err;
  }
  assert.equal(output.trim(), "", "tracked files still contain lost-deal markers:\n" + output);
});

test("GPM workbooks tracked anywhere do not carry win/loss export fields", () => {
  const books = trackedFiles().filter((file) => file.toLowerCase().endsWith(".xlsx"));
  for (const book of books) {
    const bytes = execFileSync("git", ["show", `HEAD:${book}`], {
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
    });
    const hits = workbookMarkerHits(bytes);
    assert.deepEqual(hits, [], `${book} still contains win/loss export markers: ${hits.join(", ")}`);
  }
});

test("autoSeed inserts a placeholder watchlist, not the lost-deal records", () => {
  const source = gitShow("artifacts/api-server/src/lib/autoSeed.ts");
  const payloadName = insertPayloadName(source);
  const records = extractConstArray(source, payloadName);
  assert.ok(records.length > 0, "autoSeed insert payload is empty");
  for (const record of records) {
    assert.equal(typeof record.agency, "string");
    assert.ok("tcv" in record && "competitor" in record && "notes" in record);
    assert.ok("rebidWindowStart" in record && "rebidWindowEnd" in record);
  }
  assertNoDealMarkers(JSON.stringify(records), "autoSeed insert payload");
});

test("scripts/src/seed.ts inserts a placeholder watchlist, not the lost-deal records", () => {
  const source = gitShow("scripts/src/seed.ts");
  const payloadName = insertPayloadName(source);
  const records = extractConstArray(source, payloadName);
  assert.ok(records.length > 0, "seed.ts insert payload is empty");
  for (const record of records) {
    assert.equal(typeof record.agency, "string");
    assert.ok("tcv" in record && "competitor" in record && "notes" in record);
    assert.ok("rebidWindowStart" in record && "rebidWindowEnd" in record);
  }
  assertNoDealMarkers(JSON.stringify(records), "seed.ts insert payload");
});

test("the reference script watchlist is not the lost-deal records when it is tracked", () => {
  const rel = "attached_assets/procurement_monitor_1774322015274.py";
  if (!trackedFiles().includes(rel)) return;
  const records = pythonWatchlist(gitShow(rel));
  assert.ok(records.length > 0);
  for (const record of records) {
    assert.equal(typeof record.agency, "string");
    assert.ok("tcv" in record && "competitor" in record && "notes" in record);
    assert.ok("rebid_window_start" in record && "rebid_window_end" in record);
  }
  assertNoDealMarkers(JSON.stringify(records), rel);
});
