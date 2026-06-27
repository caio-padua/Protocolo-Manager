/**
 * Onda 5 — CONTEXTO DO PACIENTE (Paxter), NATIVO e SOMENTE LEITURA.
 *
 * Consolida o que o redator do documento precisa ver ao montar uma cláusula:
 * doenças vivas / red flag (lidas do motor clínico SEM alterá-lo), últimas
 * avaliações de enfermagem, último RAS evolutivo e sessões. Também devolve os
 * TOKENS DE MESCLAGEM ({{CHAVE}}) prontos para hidratar o corpo do documento.
 *
 * Linha vermelha: NÃO toca computeMotor — apenas o consome (igual ao Cockpit).
 */

import { desc, eq } from "drizzle-orm";
import {
  db,
  clientsTable,
  anamneseRespostaTable,
  rasEvolutivoTable,
  nursingAssessmentsTable,
  sessionsTable,
  protocolsTable,
} from "@workspace/db";
import { computeMotor, type RespostaMotor } from "../motor-anamnese";

async function carregarRespostas(clienteId: number): Promise<RespostaMotor[]> {
  const rows = await db
    .select()
    .from(anamneseRespostaTable)
    .where(eq(anamneseRespostaTable.clienteId, clienteId));
  return rows.map((r) => ({
    perguntaId: r.perguntaId,
    valor: r.valorNumerico != null ? r.valorNumerico : r.valor ?? "",
  }));
}

export interface ContextoPaciente {
  paciente: { id: number; nome: string; cpf: string | null; telefone: string | null; email: string | null };
  clinica: {
    escoreTotal: number;
    gradeGlobal: string;
    redFlag: boolean;
    doencas: string[];
    sintomas: string[];
    alarmes: string[];
  };
  ultimaEnfermagem: {
    data: Date;
    alertColor: string;
    adherenceLevel: string;
    tolerance: string;
    observation: string | null;
    needsTeamContact: boolean;
  } | null;
  ultimoRasEvolutivo: {
    sessionNumber: number;
    totalSessions: number;
    progressPercent: number;
    alertColor: string;
    weeklyObservation: string | null;
  } | null;
  sessoes: { total: number; protocolosAtivos: number };
  tokensMesclagem: Record<string, string>;
}

/** Monta o contexto consolidado (somente leitura). */
export async function contextoPaciente(clienteId: number): Promise<ContextoPaciente | null> {
  const pacRows = await db.select().from(clientsTable).where(eq(clientsTable.id, clienteId)).limit(1);
  const paciente = pacRows[0];
  if (!paciente) return null;

  const respostas = await carregarRespostas(clienteId);
  const presente = await computeMotor(respostas);

  const enfRows = await db
    .select()
    .from(nursingAssessmentsTable)
    .where(eq(nursingAssessmentsTable.clientId, clienteId))
    .orderBy(desc(nursingAssessmentsTable.createdAt))
    .limit(1);
  const enf = enfRows[0];

  const rasRows = await db
    .select()
    .from(rasEvolutivoTable)
    .where(eq(rasEvolutivoTable.clientId, clienteId))
    .orderBy(desc(rasEvolutivoTable.createdAt))
    .limit(1);
  const ras = rasRows[0];

  const sess = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(eq(sessionsTable.clientId, clienteId));
  const protos = await db
    .select({ id: protocolsTable.id, status: protocolsTable.status })
    .from(protocolsTable)
    .where(eq(protocolsTable.clientId, clienteId));
  const protocolosAtivos = protos.filter((p) => p.status === "active" || p.status === "ativo").length;

  const tokensMesclagem: Record<string, string> = {
    NOME: paciente.name,
    CPF: paciente.cpf || "",
    EMAIL: paciente.email || "",
    TELEFONE: paciente.phone || "",
    DATA: new Date().toLocaleDateString("pt-BR"),
    GRADE_CLINICA: presente.gradeGlobal,
    ESCORE_CLINICO: String(presente.escoreTotal),
    DOENCAS_VIVAS: presente.doencas.join(", ") || "—",
    SINTOMAS: presente.sintomas.join(", ") || "—",
  };

  return {
    paciente: {
      id: paciente.id,
      nome: paciente.name,
      cpf: paciente.cpf || null,
      telefone: paciente.phone || null,
      email: paciente.email || null,
    },
    clinica: {
      escoreTotal: presente.escoreTotal,
      gradeGlobal: presente.gradeGlobal,
      redFlag: presente.redFlag,
      doencas: presente.doencas,
      sintomas: presente.sintomas,
      alarmes: presente.alarmes.map((a) => a.pergunta),
    },
    ultimaEnfermagem: enf
      ? {
          data: enf.createdAt,
          alertColor: enf.alertColor,
          adherenceLevel: enf.adherenceLevel,
          tolerance: enf.tolerance,
          observation: enf.observation,
          needsTeamContact: enf.needsTeamContact,
        }
      : null,
    ultimoRasEvolutivo: ras
      ? {
          sessionNumber: ras.sessionNumber,
          totalSessions: ras.totalSessions,
          progressPercent: ras.progressPercent,
          alertColor: ras.alertColor,
          weeklyObservation: ras.weeklyObservation,
        }
      : null,
    sessoes: { total: sess.length, protocolosAtivos },
    tokensMesclagem,
  };
}
