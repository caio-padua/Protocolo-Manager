import { integer, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import { substancesTable } from "./substances";
import { pgTable } from "drizzle-orm/pg-core";

export const substanceBlendComponentsTable = pgTable("substance_blend_components", {
  id: serial("id").primaryKey(),
  substanceId: integer("substance_id")
    .notNull()
    .references(() => substancesTable.id, { onDelete: "cascade" }),
  componentSubstanceId: integer("component_substance_id")
    .references(() => substancesTable.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
  componentName: text("component_name").notNull(),
  doseValue: real("dose_value"),
  doseUnit: text("dose_unit"),
  quantity: real("quantity"),
  quantityUnit: text("quantity_unit"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SubstanceBlendComponent = typeof substanceBlendComponentsTable.$inferSelect;
export type InsertSubstanceBlendComponent = typeof substanceBlendComponentsTable.$inferInsert;