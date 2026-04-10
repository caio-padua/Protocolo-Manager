import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientRatingsTable = pgTable("client_ratings", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  sessionId: integer("session_id").notNull(),
  professionalId: integer("professional_id").notNull(),
  rating: integer("rating").notNull(),
  ratingSource: text("rating_source").notNull().default("post_application"),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClientRatingSchema = createInsertSchema(clientRatingsTable).omit({ id: true, createdAt: true });
export type InsertClientRating = z.infer<typeof insertClientRatingSchema>;
export type ClientRating = typeof clientRatingsTable.$inferSelect;
