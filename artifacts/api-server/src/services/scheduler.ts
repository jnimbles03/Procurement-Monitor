import * as cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { db } from "@workspace/db";
import { configTable, scanLogsTable } from "@workspace/db";
import { runScan } from "./samScanner";
import { logger } from "../lib/logger";

let scheduledTask: ScheduledTask | null = null;

async function getScheduleConfig(): Promise<{ enabled: boolean; scheduleTime: string; scanWindowDays: number }> {
  const rows = await db.select().from(configTable);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return {
    enabled: map["schedule_enabled"] === "true",
    scheduleTime: map["schedule_time"] ?? "07:00",
    scanWindowDays: parseInt(map["scan_window_days"] ?? "30", 10),
  };
}

function timeToCron(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour = parseInt(hourStr ?? "7", 10);
  const minute = parseInt(minuteStr ?? "0", 10);
  return `${minute} ${hour} * * *`;
}

async function runScheduledScan(scanWindowDays: number): Promise<void> {
  logger.info("Running scheduled SAM.gov scan");
  try {
    const [scanLog] = await db
      .insert(scanLogsTable)
      .values({
        scanWindowDays,
        status: "running",
        progressLog: `[${new Date().toISOString().substring(11, 19)}] Scheduled scan started...`,
        totalOpportunities: 0,
        totalAlerts: 0,
      })
      .returning();

    await runScan(scanLog.id, scanWindowDays, true, true);
    logger.info({ scanLogId: scanLog.id }, "Scheduled scan completed");
  } catch (err) {
    logger.error({ err }, "Scheduled scan failed");
  }
}

export async function initScheduler(): Promise<void> {
  try {
    const config = await getScheduleConfig();

    if (scheduledTask) {
      scheduledTask.stop();
      scheduledTask = null;
    }

    if (!config.enabled) {
      logger.info("Scheduled scanning is disabled");
      return;
    }

    const cronExpression = timeToCron(config.scheduleTime);
    logger.info({ cronExpression, scheduleTime: config.scheduleTime }, "Starting daily scan scheduler");

    scheduledTask = cron.schedule(cronExpression, () => {
      void runScheduledScan(config.scanWindowDays);
    });
  } catch (err) {
    logger.error({ err }, "Failed to initialize scheduler");
  }
}

export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info("Scheduler stopped");
  }
}
