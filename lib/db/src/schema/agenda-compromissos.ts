import { pgTable, text, serial, timestamp, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";

// Compromissos importados de agendas Google (arquivo .ics ou conta conectada).
// Criada por migration SQL (scripts/migrations/20261107_agenda_google_local.sql).
export const agendaCompromissosTable = pgTable(
  "agenda_compromissos",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id").notNull(),
    googleCalendarId: text("google_calendar_id"),
    // uid + "|" + recurrence-id: garante que importar duas vezes nao duplica.
    chave: text("chave").notNull(),
    icalUid: text("ical_uid").notNull(),
    titulo: text("titulo"),
    descricao: text("descricao"),
    localTexto: text("local_texto"),
    inicio: timestamp("inicio", { withTimezone: true }),
    fim: timestamp("fim", { withTimezone: true }),
    diaInteiro: boolean("dia_inteiro").notNull().default(false),
    recorrencia: text("recorrencia"),
    status: text("status").notNull().default("ativo"),
    origem: text("origem").notNull().default("ics"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    localChaveUnique: uniqueIndex("agenda_compromissos_local_chave_unique").on(t.locationId, t.chave),
  }),
);

export type AgendaCompromisso = typeof agendaCompromissosTable.$inferSelect;
