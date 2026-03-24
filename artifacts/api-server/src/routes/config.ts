import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { configTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { initScheduler } from "../services/scheduler";

const router = Router();

const DEFAULT_KEYWORDS = [
  "electronic signature",
  "esignature",
  "e-signature",
  "digital signature",
  "contract lifecycle management",
  "contract management",
  "CLM",
  "document management",
  "DocuSign",
  "Adobe Sign",
];

const DEFAULT_NAICS = ["541511", "541512", "511210", "518210", "541519"];

async function getConfigMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(configTable);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

async function setConfig(key: string, value: string): Promise<void> {
  await db
    .insert(configTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: configTable.key, set: { value, updatedAt: new Date() } });
}

router.get("/config", async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await getConfigMap();
    res.json({
      samApiKeyConfigured: !!(process.env["SAM_API_KEY"] || config["sam_api_key"]),
      scanWindowDays: parseInt(config["scan_window_days"] ?? "30", 10),
      matchThreshold: parseFloat(config["match_threshold"] ?? "0.4"),
      searchKeywords: JSON.parse(config["search_keywords"] ?? JSON.stringify(DEFAULT_KEYWORDS)),
      naicsCodes: JSON.parse(config["naics_codes"] ?? JSON.stringify(DEFAULT_NAICS)),
      scheduleEnabled: config["schedule_enabled"] === "true",
      scheduleTime: config["schedule_time"] ?? "07:00",
      emailEnabled: config["email_enabled"] === "true",
      emailSmtpServer: config["email_smtp_server"] ?? "smtp.gmail.com",
      emailSmtpPort: parseInt(config["email_smtp_port"] ?? "587", 10),
      emailSenderEmail: config["email_sender_email"] ?? "",
      emailRecipients: JSON.parse(config["email_recipients"] ?? "[]"),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get config");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/config", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body;

    await Promise.all([
      setConfig("scan_window_days", String(body.scanWindowDays ?? 30)),
      setConfig("match_threshold", String(body.matchThreshold ?? 0.4)),
      setConfig("search_keywords", JSON.stringify(body.searchKeywords ?? DEFAULT_KEYWORDS)),
      setConfig("naics_codes", JSON.stringify(body.naicsCodes ?? DEFAULT_NAICS)),
      setConfig("schedule_enabled", String(body.scheduleEnabled ?? false)),
      setConfig("schedule_time", body.scheduleTime ?? "07:00"),
      setConfig("email_enabled", String(body.emailEnabled ?? false)),
      setConfig("email_smtp_server", body.emailSmtpServer ?? "smtp.gmail.com"),
      setConfig("email_smtp_port", String(body.emailSmtpPort ?? 587)),
      setConfig("email_sender_email", body.emailSenderEmail ?? ""),
      setConfig("email_recipients", JSON.stringify(body.emailRecipients ?? [])),
    ]);

    initScheduler().catch((schedErr) => {
      req.log.error({ err: schedErr }, "Failed to reinitialize scheduler after config update");
    });

    const configMap = await getConfigMap();
    res.json({
      samApiKeyConfigured: !!(process.env["SAM_API_KEY"] || configMap["sam_api_key"]),
      scanWindowDays: parseInt(configMap["scan_window_days"] ?? "30", 10),
      matchThreshold: parseFloat(configMap["match_threshold"] ?? "0.4"),
      searchKeywords: JSON.parse(configMap["search_keywords"] ?? JSON.stringify(DEFAULT_KEYWORDS)),
      naicsCodes: JSON.parse(configMap["naics_codes"] ?? JSON.stringify(DEFAULT_NAICS)),
      scheduleEnabled: configMap["schedule_enabled"] === "true",
      scheduleTime: configMap["schedule_time"] ?? "07:00",
      emailEnabled: configMap["email_enabled"] === "true",
      emailSmtpServer: configMap["email_smtp_server"] ?? "smtp.gmail.com",
      emailSmtpPort: parseInt(configMap["email_smtp_port"] ?? "587", 10),
      emailSenderEmail: configMap["email_sender_email"] ?? "",
      emailRecipients: JSON.parse(configMap["email_recipients"] ?? "[]"),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update config");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
