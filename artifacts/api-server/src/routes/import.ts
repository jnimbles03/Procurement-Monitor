import { Router, Request, Response } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { watchlistEntriesTable } from "@workspace/db";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

interface ExcelRow {
  Agency?: string;
  agency?: string;
  State?: string;
  state?: string;
  TCV?: string | number;
  tcv?: string | number;
  Priority?: string;
  priority?: string;
  Keywords?: string;
  keywords?: string;
  Competitor?: string;
  competitor?: string;
  Reason?: string;
  reason?: string;
  "Rebid Start"?: string;
  rebidWindowStart?: string;
  "Rebid End"?: string;
  rebidWindowEnd?: string;
  Notes?: string;
  notes?: string;
}

function coerceRow(row: ExcelRow) {
  const agency = String(row.Agency ?? row.agency ?? "").trim();
  if (!agency) return null;

  const rawKeywords = row.Keywords ?? row.keywords ?? "";
  const searchTerms = String(rawKeywords)
    .split(/[,\n]/)
    .map(s => s.trim())
    .filter(Boolean);

  const rawPriority = String(row.Priority ?? row.priority ?? "WATCH").toUpperCase();
  const priority = ["HIGH", "MEDIUM", "WATCH", "LOW"].includes(rawPriority) ? rawPriority : "WATCH";

  const rawTcv = row.TCV ?? row.tcv ?? "0";
  const tcv = String(typeof rawTcv === "number" ? rawTcv.toFixed(2) : rawTcv);

  const rebidStart = row["Rebid Start"] ?? row.rebidWindowStart ?? null;
  const rebidEnd = row["Rebid End"] ?? row.rebidWindowEnd ?? null;

  return {
    agency,
    state: String(row.State ?? row.state ?? "").trim(),
    tcv,
    priority,
    searchTerms,
    competitor: String(row.Competitor ?? row.competitor ?? "").trim(),
    reason: String(row.Reason ?? row.reason ?? "").trim(),
    rebidWindowStart: rebidStart ? String(rebidStart).trim() : null,
    rebidWindowEnd: rebidEnd ? String(rebidEnd).trim() : null,
    notes: String(row.Notes ?? row.notes ?? "").trim(),
  };
}

const ALLOWED_MIMETYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/csv",
]);

const MAX_ROWS = 500;

router.post("/watchlist/import", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    if (!ALLOWED_MIMETYPES.has(req.file.mimetype) && !req.file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      res.status(400).json({ error: "Unsupported file type. Please upload .xlsx, .xls, or .csv files." });
      return;
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      res.status(400).json({ error: "Excel file is empty or has no sheets" });
      return;
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet!, { defval: "" });

    const validRows = rows
      .slice(0, MAX_ROWS)
      .map(coerceRow)
      .filter((r): r is NonNullable<ReturnType<typeof coerceRow>> => r !== null);

    if (validRows.length === 0) {
      res.status(400).json({ error: "No valid rows found. Ensure the file has an 'Agency' column." });
      return;
    }

    const inserted = await db
      .insert(watchlistEntriesTable)
      .values(validRows)
      .returning();

    res.json({ imported: inserted.length, entries: inserted });
  } catch (err) {
    req.log.error({ err }, "Failed to import Excel file");
    res.status(500).json({ error: "Failed to parse or import file" });
  }
});

export default router;
