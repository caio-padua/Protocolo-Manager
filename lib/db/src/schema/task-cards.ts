import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const taskCardsTable = pgTable("task_cards", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  assignedRole: text("assigned_role").notNull(),
  assignedProfessionalId: integer("assigned_professional_id"),
  clientId: integer("client_id").notNull(),
  protocolId: integer("protocol_id"),
  sessionId: integer("session_id"),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("pending"),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: text("due_date"),
  trelloCardId: text("trello_card_id"),
  trelloListId: text("trello_list_id"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: integer("completed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTaskCardSchema = createInsertSchema(taskCardsTable).omit({ id: true, createdAt: true });
export type InsertTaskCard = z.infer<typeof insertTaskCardSchema>;
export type TaskCard = typeof taskCardsTable.$inferSelect;
