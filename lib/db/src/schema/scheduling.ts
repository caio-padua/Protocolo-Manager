import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Solicitacoes de agendamento das ENTRADAS do paciente que NAO passam pelo
// motor de injetaveis (esse permanece intacto). Cobre tres entradas:
//   - 'estetico'   -> Entrada 2 (procedimentos esteticos)
//   - 'dr_caio'    -> Entrada 3 (consulta exclusiva, Regra de Ouro)
//   - 'assistente' -> Entrada 4 (medicos assistentes; slot real escolhido)
// A clinica confirma cada solicitacao manualmente. NUNCA misturar as entradas.
export const schedulingRequestsTable = pgTable("scheduling_requests", {
  id: serial("id").primaryKey(),
  // qual porta: 'estetico' | 'dr_caio' | 'assistente'
  entrada: text("entrada").notNull(),
  // Regra de Ouro (so dr_caio): 'concierge' (pago) | 'fila' (gratis)
  path: text("path"),

  // identificacao do paciente (pode nao ser cliente cadastrado ainda)
  patientName: text("patient_name").notNull(),
  patientPhone: text("patient_phone").notNull(),
  patientCpf: text("patient_cpf"),
  patientEmail: text("patient_email"),

  // desejo / procedimento / motivo
  desire: text("desire"),

  // preferencia (dr_caio e estetico): dia da semana 0-6 e periodo
  preferredWeekday: integer("preferred_weekday"),
  preferredPeriod: text("preferred_period"), // 'manha' | 'tarde' | 'noite'
  // data minima desejada (dr_caio: a partir de 3 meses)
  earliestDate: text("earliest_date"),

  // Entrada 4 (assistente): medico e slot real escolhido no motor de agenda
  professionalId: integer("professional_id"),
  resourceId: integer("resource_id"),
  chosenDate: text("chosen_date"), // YYYY-MM-DD
  chosenTime: text("chosen_time"), // HH:mm

  // braco de pagamento (estrutura para a Onda 8.4; sem cobranca real aqui)
  // 'concierge' | 'sinal25' | 'estetico_pos' | null
  paymentArm: text("payment_arm"),
  paymentStatus: text("payment_status").notNull().default("nao_aplicavel"),

  // Cobranca real Asaas amarrada a solicitacao Concierge (sem poluir clients).
  asaasCustomerId: text("asaas_customer_id"),
  asaasChargeId: text("asaas_charge_id"),
  asaasInvoiceUrl: text("asaas_invoice_url"),
  paymentAmount: real("payment_amount"),
  paidAt: text("paid_at"),

  // ciclo de vida da solicitacao
  status: text("status").notNull().default("novo"),
  // 'novo' | 'contatado' | 'agendado' | 'cancelado' | 'devolvido'
  notes: text("notes"),

  // Pos-pagamento (Bloco B): triagem por CPF e vinculo ao cadastro criado/achado.
  clientId: integer("client_id"),
  triagem: text("triagem"), // 'novo' | 'retorno'
  // Idempotencia da finalizacao (cadastro + e-mail + senha) apos o pagamento.
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  arrivalEmailSentAt: timestamp("arrival_email_sent_at", { withTimezone: true }),
  arrivalEmailError: text("arrival_email_error"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSchedulingRequestSchema = createInsertSchema(
  schedulingRequestsTable,
).omit({ id: true, createdAt: true });
export type InsertSchedulingRequest = z.infer<
  typeof insertSchedulingRequestSchema
>;
export type SchedulingRequest = typeof schedulingRequestsTable.$inferSelect;
