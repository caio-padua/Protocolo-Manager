import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, clientsTable, sessionsTable } from "@workspace/db";
import { verifyClinicAccount } from "./google-calendar";
import { EquipeErro } from "./equipe-reserva.js";
import { auditarPlano } from "./pit-stop.js";
import { syncProcedureVisit, type VisitSyncResult } from "./session-google-sync";

/**
 * Sincronização do plano confirmado do Pit Stop com o Google Agenda (um evento por visita/agenda da equipe).
 * Só marca "sincronizado" quando o Google confirmou TODAS as visitas; falha parcial ou total fica visível e pode ser
 * reprocessada: visita já confirmada não é enviada de novo e o identificador reservado impede evento duplicado.
 */
export type SincronizacaoPlano = {
  estado: "sincronizado" | "parcial" | "erro";
  visitas: (VisitSyncResult & { agenda: string | null; procedimento: string })[];
  motivo?: string;
};

export async function sincronizarPlano(empresaId: number, planoId: number, me: number): Promise<SincronizacaoPlano> {
  const plano = (await db.execute(sql`SELECT estado, client_id FROM agendamento_planos WHERE id=${planoId} AND empresa_id=${empresaId}`)).rows[0];
  if (!plano) throw new EquipeErro(404, "Plano não encontrado.", "plano_nao_encontrado");
  if (plano.estado !== "confirmado") throw new EquipeErro(409, "Só se envia ao Google um plano confirmado.", "plano_nao_confirmado");
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, Number(plano.client_id)));
  if (!client) throw new EquipeErro(404, "Cliente não encontrado.", "cliente_nao_encontrado");

  const linhas = (await db.execute(sql`SELECT s.id AS session_id, o.numero, pp.nome_snapshot AS procedimento, pp.total_sessoes,
      r.name AS agenda, o.ocorrencia_id, o.data, o.hora, pp.id AS item, o.endereco_visita
    FROM agendamento_plano_ocorrencias o
    JOIN protocolo_procedimentos pp ON pp.id=o.protocolo_procedimento_id
    JOIN protocolo_ocorrencia_participantes x ON x.ocorrencia_id=o.ocorrencia_id
    JOIN sessions s ON s.id=x.session_id LEFT JOIN agenda_resources r ON r.id=x.resource_id
    WHERE o.plano_id=${planoId} ORDER BY o.data, o.hora, pp.ordem, o.numero, x.ordem`)).rows;

  const registrar = async (estado: SincronizacaoPlano["estado"], visitas: SincronizacaoPlano["visitas"], motivo?: string) => {
    await db.execute(sql`UPDATE agendamento_planos SET sync_estado=${estado}, sync_em=now(),
      sync_detalhe=${JSON.stringify({ visitas, motivo: motivo ?? null })}::jsonb, updated_at=now() WHERE id=${planoId}`);
    await auditarPlano(db, empresaId, planoId, me, "enviou_ao_google", {
      estado, motivo: motivo ?? null, visitas: visitas.length, falhas: visitas.filter((v) => v.status === "falhou" || v.status === "incerto").length,
    });
    return { estado, visitas, ...(motivo ? { motivo } : {}) };
  };

  const pendentes: { l: Record<string, unknown>; s: typeof sessionsTable.$inferSelect }[] = [];
  for (const l of linhas) {
    const [s] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, Number(l.session_id)));
    if (s) pendentes.push({ l, s });
  }
  const falhaDeConta = async () => registrar("erro", pendentes.map(({ l, s }) => ({
    sessionId: s.id, date: s.scheduledDate, time: s.scheduledTime, status: "falhou" as const, code: "google_indisponivel",
    error: "Não foi possível confirmar a conta Google autorizada.", agenda: l.agenda == null ? null : String(l.agenda), procedimento: String(l.procedimento),
  })), "google_indisponivel");

  if (pendentes.some(({ s }) => !s.googleEventId || s.googleSyncPendingOperation)) {
    let conta: { ok: boolean } = { ok: false };
    try { conta = await verifyClinicAccount(); } catch { conta = { ok: false }; }
    if (!conta.ok) return falhaDeConta();
  }

  const visitas: SincronizacaoPlano["visitas"] = [];
  for (const { l, s } of pendentes) {
    const comum = { agenda: l.agenda == null ? null : String(l.agenda), procedimento: String(l.procedimento) };
    if (s.googleEventId && !s.googleSyncPendingOperation) {
      visitas.push({ sessionId: s.id, date: s.scheduledDate, time: s.scheduledTime, status: "ja_sincronizado", eventId: s.googleEventId, ...comum });
      continue;
    }
    const equipe = (await db.execute(sql`SELECT a.name AS area, r.name AS agenda, p.name AS profissional
      FROM protocolo_ocorrencia_participantes x LEFT JOIN professional_areas a ON a.id=x.category_id
      LEFT JOIN agenda_resources r ON r.id=x.resource_id LEFT JOIN professionals p ON p.id=x.professional_id
      WHERE x.ocorrencia_id=${l.ocorrencia_id} ORDER BY x.ordem`)).rows
      .map((e) => `${e.area ?? "Equipe"}: ${e.agenda ?? "agenda"}${e.profissional ? ` (${e.profissional})` : ""}`).join("; ");
    const r = await syncProcedureVisit(s, {
      // A autorização (permissão da matriz + corpo clínico da empresa) foi dada pela rota; não depende de vínculo legado com local.
      empresaId, professionalId: null, enderecoHomeCare: l.endereco_visita == null ? null : String(l.endereco_visita), client, position: Number(l.numero), total: Number(l.total_sessoes),
      procedureName: String(l.procedimento), teamLine: equipe,
    });
    visitas.push({ ...r, ...comum });
  }
  const ok = (v: { status: string }) => v.status === "sincronizado" || v.status === "ja_sincronizado";
  const estado = visitas.length > 0 && visitas.every(ok) ? "sincronizado" : visitas.some(ok) ? "parcial" : "erro";
  return registrar(estado, visitas);
}
