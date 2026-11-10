import { pgTable, text, serial, timestamp, integer, real, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type ProtocolSubstanceCatalogSnapshot = {
  id: number;
  name: string;
  category: string;
  color: string;
  defaultDose: string | null;
  unit: string | null;
  maxSessionsPerWeek: number | null;
  intervalDays: number | null;
  notes: string | null;
  pricePerUnit: number;
  procedureType: string;
  viaUso: string | null;
  frequenciaBase: string | null;
  doctorParticipation: boolean | null;
  durationMinutes: number;
  description: string | null;
  mainFunction: string | null;
  perceivedEffects: string | null;
  timeToEffect: string | null;
  starRating: number;
  bodySystemEffects: unknown;
  categoryMeters: unknown;
  longevityBenefit: string | null;
  qualityOfLifeImpact: string | null;
  sleepBenefit: string | null;
  energyBenefit: string | null;
  libidoBenefit: string | null;
  physicalPerformance: string | null;
  muscleStrength: string | null;
  mentalClarity: string | null;
  skinHairNails: string | null;
  immuneSupport: string | null;
  contraindications: string | null;
  scientificEvidence: string | null;
  categoryType: string | null;
  codigoPadcom: string | null;
  subCategoria: string | null;
  disponivel: boolean | null;
  tags: string[] | null;
  blocoId: string | null;
  grau: string | null;
  composicao: string | null;
  posologia: string | null;
  areaSemantica: string | null;
  exigeValidacaoHumana: boolean | null;
  unidadeId: number | null;
  posologiaEstruturada: unknown;
  concentrationMg: string | null;
  volumeAmpola: string | null;
  isBlend: boolean;
  presentationQuantity: number | null;
  presentationUnit: string | null;
  ampouleVolumeMl: number | null;
  components: Array<{
    id: number;
    substanceId: number;
    componentSubstanceId: number | null;
    sortOrder: number;
    componentName: string;
    doseValue: number | null;
    doseUnit: string | null;
    quantity: number | null;
    quantityUnit: string | null;
    notes: string | null;
  }>;
};

export const protocolsTable = pgTable("protocols", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  professionalId: integer("professional_id"),
  title: text("title").notNull(),
  status: text("status").notNull().default("suggested"),
  startDate: text("start_date").notNull(),
  scheduledTime: text("scheduled_time").notNull().default("09:00"),
  schedulingMode: text("scheduling_mode").notNull().default("weekly"),
  endDate: text("end_date"),
  unit: text("unit"),
  serviceType: text("service_type").notNull().default("clinic"),
  totalSessions: integer("total_sessions").notNull().default(0),
  completedSessions: integer("completed_sessions").notNull().default(0),
  totalValue: real("total_value").notNull().default(0),
  notes: text("notes"),
  // Enfermeira designada para o protocolo (FK lógica → professionals).
  // Nulo = protocolo executado só na clínica pelo médico/staff fixo.
  nurseId: integer("nurse_id"),
  // Custo total da enfermagem = nurseId.homeServiceFeePerVisit × totalSessions.
  // Separado do totalValue (resposta A do CEO: somado automaticamente).
  nurseServiceFee: real("nurse_service_fee"),
  empresaId: integer("empresa_id"),
  // Linha de venda à qual este protocolo pertence (classificação comercial).
  // Valores canônicos: "magistral" | "digital" | "injetoterapia" | null (não classificado).
  linhaVenda: text("linha_venda"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const protocolItemsTable = pgTable("protocol_items", {
  id: serial("id").primaryKey(),
  protocolId: integer("protocol_id").notNull(),
  substanceId: integer("substance_id").notNull(),
  dose: text("dose").notNull(),
  unitPrice: real("unit_price").notNull().default(0),
  totalSessions: integer("total_sessions").notNull(),
  completedSessions: integer("completed_sessions").notNull().default(0),
  intervalDays: integer("interval_days").notNull().default(7),
  startDate: text("start_date").notNull(),
  frequency: text("frequency").notNull().default("weekly"),
  // Fotografia do catálogo usada na criação; nulo para protocolos históricos.
  catalogSnapshot: jsonb("catalog_snapshot").$type<ProtocolSubstanceCatalogSnapshot | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Auditoria de emissão oficial do protocolo ────────────────────────────────
// Gravado toda vez que o CEO clica em "Emitir ao Paciente" (POST /emit-document).
// Preserva quem autorizou, quando ocorreu e qual foi o resultado de cada canal.
export const protocolEmissoesTable = pgTable("protocol_emissoes", {
  id: serial("id").primaryKey(),
  protocolId: integer("protocol_id").notNull(),
  emitidoAt: timestamp("emitido_at", { withTimezone: true }).notNull().defaultNow(),
  autorizadoPor: text("autorizado_por").notNull().default("CEO"),
  // Resultado de cada canal
  emailSent: boolean("email_sent").notNull().default(false),
  emailError: text("email_error"),
  driveUploaded: boolean("drive_uploaded").notNull().default(false),
  cadernosCount: integer("cadernos_count").notNull().default(0),
});

export const insertProtocolSchema = createInsertSchema(protocolsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProtocolItemSchema = createInsertSchema(protocolItemsTable).omit({ id: true, createdAt: true });
export type InsertProtocol = z.infer<typeof insertProtocolSchema>;
export type InsertProtocolItem = z.infer<typeof insertProtocolItemSchema>;
export type Protocol = typeof protocolsTable.$inferSelect;
export type ProtocolItem = typeof protocolItemsTable.$inferSelect;
