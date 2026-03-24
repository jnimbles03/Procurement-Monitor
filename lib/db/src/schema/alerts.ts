import { pgTable, serial, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { watchlistEntriesTable } from "./watchlistEntries";

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  source: text("source").notNull().default("SAM.gov"),
  agencyMatchId: integer("agency_match_id").references(() => watchlistEntriesTable.id, { onDelete: "set null" }),
  opportunityTitle: text("opportunity_title").notNull(),
  solicitationNumber: text("solicitation_number").notNull().default(""),
  postedDate: text("posted_date").notNull().default(""),
  responseDeadline: text("response_deadline").notNull().default(""),
  url: text("url").notNull().default(""),
  matchScore: numeric("match_score", { precision: 5, scale: 4 }).notNull().default("0"),
  watchlistTcv: numeric("watchlist_tcv", { precision: 14, scale: 2 }).notNull().default("0"),
  watchlistPriority: text("watchlist_priority").notNull().default("WATCH"),
  watchlistAgency: text("watchlist_agency").notNull().default(""),
  noticeId: text("notice_id").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true, createdAt: true });

export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
