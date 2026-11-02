import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const clinicalAccessGrantsTable = pgTable(
  "clinical_access_grants",
  {
    id: serial("id").primaryKey(),
    empresaId: integer("empresa_id").notNull(),
    locationId: integer("location_id").notNull(),
    professionalId: integer("professional_id").notNull(),
    canPrescribe: boolean("can_prescribe").notNull().default(false),
    canRequestExams: boolean("can_request_exams").notNull().default(false),
    isClinicAdmin: boolean("is_clinic_admin").notNull().default(false),
    isResponsibleDoctor: boolean("is_responsible_doctor").notNull().default(false),
    updatedByProfessionalId: integer("updated_by_professional_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    professionalLocationUnique: uniqueIndex("clinical_access_grants_professional_location_uk")
      .on(table.professionalId, table.locationId),
    responsibleDoctorUnique: uniqueIndex("clinical_access_grants_one_responsible_per_location_uk")
      .on(table.locationId)
      .where(sql`${table.isResponsibleDoctor} IS TRUE`),
    locationCompanyIndex: index("clinical_access_grants_location_company_idx")
      .on(table.locationId, table.empresaId),
    positiveScope: check(
      "clinical_access_grants_positive_scope_ck",
      sql`${table.empresaId} > 0 AND ${table.locationId} > 0 AND ${table.professionalId} > 0`,
    ),
  }),
);

export const clinicalApprovalRequestsTable = pgTable(
  "clinical_approval_requests",
  {
    id: serial("id").primaryKey(),
    requestKey: text("request_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("pendente"),
    empresaId: integer("empresa_id").notNull(),
    locationId: integer("location_id").notNull(),
    clientId: integer("client_id").notNull(),
    preparedByProfessionalId: integer("prepared_by_professional_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    rejectionReason: text("rejection_reason"),
    decidedByProfessionalId: integer("decided_by_professional_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => ({
    requesterKeyUnique: uniqueIndex("clinical_approval_requests_requester_key_uk")
      .on(table.preparedByProfessionalId, table.requestKey),
    reviewQueueIndex: index("clinical_approval_requests_review_queue_idx")
      .on(table.empresaId, table.locationId, table.status, table.createdAt),
    requesterHistoryIndex: index("clinical_approval_requests_requester_history_idx")
      .on(table.preparedByProfessionalId, table.createdAt),
    validKind: check(
      "clinical_approval_requests_kind_ck",
      sql`${table.kind} IN ('prescricao', 'pedido_exames')`,
    ),
    validStatus: check(
      "clinical_approval_requests_status_ck",
      sql`${table.status} IN ('pendente', 'processando', 'aprovado', 'rejeitado', 'conferir_resultado')`,
    ),
    positiveScope: check(
      "clinical_approval_requests_positive_scope_ck",
      sql`${table.empresaId} > 0 AND ${table.locationId} > 0 AND ${table.clientId} > 0`,
    ),
  }),
);

export const clinicalApprovalEventsTable = pgTable(
  "clinical_approval_events",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id").notNull(),
    actorProfessionalId: integer("actor_professional_id").notNull(),
    eventType: text("event_type").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    requestTimelineIndex: index("clinical_approval_events_request_timeline_idx")
      .on(table.requestId, table.createdAt),
  }),
);

export const clinicalAccessAuditTable = pgTable(
  "clinical_access_audit",
  {
    id: serial("id").primaryKey(),
    empresaId: integer("empresa_id").notNull(),
    locationId: integer("location_id").notNull(),
    subjectProfessionalId: integer("subject_professional_id").notNull(),
    actorProfessionalId: integer("actor_professional_id").notNull(),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scopeTimelineIndex: index("clinical_access_audit_scope_timeline_idx")
      .on(table.empresaId, table.locationId, table.createdAt),
    subjectTimelineIndex: index("clinical_access_audit_subject_timeline_idx")
      .on(table.subjectProfessionalId, table.createdAt),
  }),
);

export type ClinicalAccessGrant = typeof clinicalAccessGrantsTable.$inferSelect;
export type ClinicalApprovalRequest = typeof clinicalApprovalRequestsTable.$inferSelect;
export type ClinicalApprovalEvent = typeof clinicalApprovalEventsTable.$inferSelect;
export type ClinicalAccessAudit = typeof clinicalAccessAuditTable.$inferSelect;
