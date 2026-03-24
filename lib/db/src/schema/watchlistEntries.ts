import { pgTable, serial, text, numeric, date, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const watchlistEntriesTable = pgTable("watchlist_entries", {
  id: serial("id").primaryKey(),
  agency: text("agency").notNull(),
  searchTerms: jsonb("search_terms").notNull().$type<string[]>().default([]),
  state: text("state").notNull().default(""),
  tcv: numeric("tcv", { precision: 14, scale: 2 }).notNull().default("0"),
  reason: text("reason").notNull().default(""),
  competitor: text("competitor").notNull().default(""),
  rebidWindowStart: date("rebid_window_start"),
  rebidWindowEnd: date("rebid_window_end"),
  priority: text("priority").notNull().default("WATCH"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWatchlistEntrySchema = createInsertSchema(watchlistEntriesTable, {
  searchTerms: z.array(z.string()),
}).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertWatchlistEntry = z.infer<typeof insertWatchlistEntrySchema>;
export type WatchlistEntry = typeof watchlistEntriesTable.$inferSelect;
