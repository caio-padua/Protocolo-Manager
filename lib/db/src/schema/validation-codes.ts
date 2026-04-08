import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const validationCodesTable = pgTable("validation_codes", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  clientId: integer("client_id").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertValidationCodeSchema = createInsertSchema(validationCodesTable).omit({ id: true, createdAt: true });
export type InsertValidationCode = z.infer<typeof insertValidationCodeSchema>;
export type ValidationCode = typeof validationCodesTable.$inferSelect;
