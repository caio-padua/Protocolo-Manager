import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db, assinaturaSolicitacoesTable as solicitacoes, assinaturaTemplatesTable as templates,
  assinaturaSignatariosTable as signatarios, assinaturaNotificacoesTable as notificacoes,
  clientsTable,
} from "@workspace/db";
import { getAdapter } from "./adapters";
import { htmlParaPdfBase64 } from "./htmlParaPdf";
import { readPdfAssinado } from "./objectStorage";
import { ensureZapsignTokenLoaded, processarNotificacoes } from "./service";
import { logger } from "../logger";
import type { ResultadoEnvio, Signatario } from "./types";

const elegivel = and(
  eq(solicitacoes.status, "ENVIADO"),
  eq(solicitacoes.provedorCodigo, "zapsign"),
  sql`${solicitacoes.metadata} @> '{"fallback":true}'::jsonb`,
);

export async function saudeFallback() {
  const [row] = await db.select({
    aguardandoReenvioReal: sql<number>`count(*)::int`,
    bloqueados: sql<number>`count(*) filter (where ${solicitacoes.metadata}->>'reenvioEstado' in ('RESERVADO','INCERTO','CONTEUDO_DIVERGENTE'))::int`,
  }).from(solicitacoes).where(elegivel);
  return row!;
}

/** Reserva nunca expira: external_id do ZapSign não é garantia de deduplicação. */
export async function reenviarFallbacks() {
  await ensureZapsignTokenLoaded();
  const adapter = getAdapter("zapsign");
  if (!adapter.isConfigured()) throw new Error("zapsign_nao_configurado");
  const pendentes = await db.select().from(solicitacoes).where(and(
    elegivel,
    sql`coalesce(${solicitacoes.metadata}->>'reenvioEstado','') in ('','RECIBO')`,
  )).orderBy(asc(solicitacoes.id)).limit(10);
  const resumo = { reenviados: 0, falhas: 0, bloqueados: 0 };
  for (const sol of pendentes) {
    const [claim] = await db.update(solicitacoes).set({
      metadata: sql`${solicitacoes.metadata} || '{"reenvioEstado":"RESERVADO"}'::jsonb`,
    }).where(and(elegivel, eq(solicitacoes.id, sol.id),
      sql`coalesce(${solicitacoes.metadata}->>'reenvioEstado','') in ('','RECIBO')`,
    )).returning({ metadata: solicitacoes.metadata });
    if (!claim) continue;
    // O lote pode estar defasado: usar SEMPRE o recibo devolvido pela reserva
    // atômica, inclusive se outro executor acabou de persistir RECIBO.
    const meta = claim.metadata as Record<string, unknown>;
    let recibo = meta.reenvioRecibo as ResultadoEnvio | undefined;
    let reciboPersistido = Boolean(recibo);
    let chamouProvedor = false;
    try {
      const snapshot = sol.signatariosSnapshot as Signatario[];
      const paciente = Array.isArray(snapshot) && snapshot.find(s => s.papel === "PACIENTE");
      if (!paciente || !snapshot.every(s => s.nome && Number.isInteger(s.ordem)) ||
        !(paciente.email || paciente.telefone) || !sol.pacienteId || !sol.zapsignExternalId) {
        throw new Error("conteudo_original_incompleto");
      }
      if (!recibo) {
        let pdfBase64: string;
        if (typeof meta.originalPdfKey === "string" && meta.originalPdfKey.startsWith("assinaturas/original-")) {
          pdfBase64 = (await readPdfAssinado(meta.originalPdfKey)).toString("base64");
        } else {
          const [tpl] = sol.templateId ? await db.select().from(templates)
            .where(eq(templates.id, sol.templateId)).limit(1) : [];
          if (!tpl) throw new Error("conteudo_original_incompleto");
          let html = tpl.corpoHtml;
          for (const [k, v] of Object.entries(sol.dadosHidratacao as Record<string, string>)) {
            html = html.replaceAll(`{{${k}}}`, v ?? "");
          }
          if (!sol.hashOriginal || createHash("sha256").update(html).digest("hex") !== sol.hashOriginal) {
            throw new Error("conteudo_original_divergente");
          }
          pdfBase64 = await htmlParaPdfBase64(html);
        }
        chamouProvedor = true;
        recibo = await adapter.createDocumentEnvelope({
          templateCodigo: sol.tipoDoc, conteudoHtml: "", pdfBase64,
          hashOriginal: sol.hashOriginal || "", signatarios: snapshot,
          externalId: sol.zapsignExternalId, enviarWhatsappAutomatico: false,
          enviarEmailAutomatico: false,
          ordemAssinaturaAtiva: snapshot.length > 1, metadata: { solicitacaoId: sol.id },
        });
        if (!recibo.envelopeId || recibo.envelopeId.startsWith("MOCK-") ||
          recibo.linksAssinatura.length !== snapshot.length || recibo.linksAssinatura.some(l => !/^https:\/\//.test(l.url) || l.url.includes(".local/"))) {
          throw new Error("resposta_provedor_invalida");
        }
        // Recibo mínimo: não guardar rawProvider (pode conter dados pessoais desnecessários).
        recibo = { envelopeId: recibo.envelopeId, linksAssinatura: recibo.linksAssinatura, rawProvider: null };
        await db.update(solicitacoes).set({
          metadata: sql`${solicitacoes.metadata} || ${JSON.stringify({ reenvioEstado: "RECIBO", reenvioRecibo: recibo })}::jsonb`,
        }).where(eq(solicitacoes.id, sol.id));
        reciboPersistido = true;
      }
      const resultado = recibo;
      const concluido = await db.transaction(async tx => {
        // Serializa também a finalização: dois executores podem recuperar o
        // mesmo recibo, mas somente um grava signatários e notificações.
        const [atualizado] = await tx.update(solicitacoes).set({
          provedorEnvelopeId: resultado.envelopeId, enviadoEm: new Date(),
          metadata: sql`(${solicitacoes.metadata} - 'reenvioRecibo') || '{"mock":false,"fallback":false,"reenvioEstado":"CONCLUIDO"}'::jsonb`,
        }).where(and(eq(solicitacoes.id, sol.id), elegivel)).returning({ id: solicitacoes.id });
        if (!atualizado) return false;
        const links = new Map(resultado.linksAssinatura.map(l => [l.email, l.url]));
        for (const s of snapshot) {
          const url = (s.email && links.get(s.email)) || resultado.linksAssinatura[s.ordem - 1]?.url;
          if (!url) throw new Error("link_signatario_ausente");
          const atualizados = await tx.update(signatarios).set({ linkAssinatura: url, status: "ENVIADO" })
            .where(and(eq(signatarios.solicitacaoId, sol.id), eq(signatarios.ordem, s.ordem)))
            .returning({ id: signatarios.id });
          if (!atualizados.length) await tx.insert(signatarios).values({
            solicitacaoId: sol.id, ...s, cpf: s.cpf ?? null, email: s.email ?? null,
            telefone: s.telefone ?? null, linkAssinatura: url, status: "ENVIADO",
          });
        }
        const linkPaciente = (paciente.email && links.get(paciente.email)) ||
          resultado.linksAssinatura[paciente.ordem - 1]?.url;
        if (!linkPaciente) throw new Error("link_paciente_ausente");
        const [cliente] = await tx.select({ telegramChatId: clientsTable.telegramChatId }).from(clientsTable)
          .where(eq(clientsTable.id, sol.pacienteId!)).limit(1);
        // Retira links mock ainda pendentes, preservando histórico.
        await tx.update(notificacoes).set({ status: "PULADO", erro: "substituido_por_envio_real" })
          .where(and(eq(notificacoes.solicitacaoId, sol.id), eq(notificacoes.status, "PENDENTE")));
        for (const canal of [...new Set(sol.canaisDistribuir || ["WHATSAPP"])].filter(c => c !== "DRIVE")) {
          const destino = canal === "EMAIL" ? paciente.email : canal === "WHATSAPP" ? paciente.telefone :
            canal === "TELEGRAM" ? cliente?.telegramChatId : null;
          await tx.insert(notificacoes).values({
            solicitacaoId: sol.id, canal, momento: "REENVIO_REAL",
            destinatario: destino || "", assunto: "PAXMED | Documento para assinatura",
            corpo: `Olá ${paciente.nome.split(" ")[0]}, seu documento está disponível para assinatura digital: ${linkPaciente}`,
            status: destino ? "PENDENTE" : "PULADO", erro: destino ? null : `sem_${canal.toLowerCase()}`,
          }).onConflictDoNothing();
        }
        return true;
      });
      if (!concluido) continue;
      resumo.reenviados++;
      await processarNotificacoes(50, sol.id, "REENVIO_REAL");
    } catch (err) {
      const erro = err instanceof Error ? err.message : "";
      const planoRecusado = /^ZapSign create failed 402:/.test(erro);
      const estado = reciboPersistido ? "RECIBO" : planoRecusado ? "" : chamouProvedor ? "INCERTO" : "CONTEUDO_DIVERGENTE";
      await db.update(solicitacoes).set({
        metadata: sql`${solicitacoes.metadata} || ${JSON.stringify({ reenvioEstado: estado })}::jsonb`,
      }).where(and(eq(solicitacoes.id, sol.id), elegivel));
      logger.warn({ solicitacaoId: sol.id, estado }, "[assinatura] reenvio real não concluído");
      if (estado === "INCERTO" || estado === "CONTEUDO_DIVERGENTE") resumo.bloqueados++;
      else resumo.falhas++;
      if (planoRecusado) break;
    }
  }
  return { ...resumo, ...await saudeFallback() };
}
