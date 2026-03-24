import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scanLogsTable = pgTable("scan_logs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  scanWindowDays: integer("scan_window_days").notNull().default(30),
  totalOpportunities: integer("total_opportunities").notNull().default(0),
  totalAlerts: integer("total_alerts").notNull().default(0),
  status: text("status").notNull().default("running"),
  progressLog: text("progress_log").notNull().default(""),
  errorMessage: text("error_message"),
});

export const insertScanLogSchema = createInsertSchema(scanLogsTable).omit({ id: true });

export type InsertScanLog = z.infer<typeof insertScanLogSchema>;
export type ScanLog = typeof scanLogsTable.$inferSelect;
