/**
 * Serviço do motor de Assinatura Remota (Paxter) — NATIVO.
 * Orquestra: hidrata template -> gera PDF -> chama adapter (ZapSign) -> grava
 * banco -> pós-assinatura (arquiva no Drive + avisa CEO). Modo MOCK automático
 * quando não há token no cofre/env (boot nunca cai por falta de segredo).
 *
 * Conceito-raiz: dado nasce nativo (sem etiqueta de origem). A LÓGICA do fluxo
 * espelha o motor validado; só a "fiação" muda (cofre, object storage, db, auth).
 */

import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  assinaturaSolicitacoesTable,
  assinaturaSignatariosTable,
  assinaturaWebhookEventosTable,
  assinaturaTemplatesTable,
  assinaturaNotificacoesTable,
  assinaturaTogglesAdminTable,
  clientsTable,
} from "@workspace/db";
import { logger } from "../logger";
import { getSecret } from "../secure-settings";
import { sendWhatsapp } from "../whatsapp";
import { uploadFileToDrive } from "../google-drive";
import { getAdapter } from "./adapters";
import { htmlParaPdfBase64 } from "./htmlParaPdf";
import { uploadPdfAssinado, readPdfAssinado } from "./objectStorage";
import type {
  CanalDistribuicao,
  EventoWebhook,
  ProvedorCodigo,
  Signatario,
  SolicitacaoStatus,
} from "./types";

// ---------------------------------------------------------------------------
// Hidratação do token (cofre -> process.env), sem dependência de boot.
// ---------------------------------------------------------------------------
let _tokenCarregado = false;
async function ensureZapsignTokenLoaded(): Promise<void> {
  if (_tokenCarregado) return;
  _tokenCarregado = true;
  if (process.env["ZAPSIGN_API_TOKEN"] || process.env["ZAPSIGN_TOKEN"]) return;
  try {
    const tok = await getSecret("zapsign.token");
    if (tok && tok.trim()) process.env["ZAPSIGN_API_TOKEN"] = tok.trim();
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[assinatura] falha ao ler token do cofre");
  }
}

// ---------------------------------------------------------------------------
// Toggles admin (singleton id=1).
// ---------------------------------------------------------------------------
async function ensureToggles() {
  const rows = await db
    .select()
    .from(assinaturaTogglesAdminTable)
    .where(eq(assinaturaTogglesAdminTable.id, 1))
    .limit(1);
  if (rows[0]) return rows[0];
  const inserted = await db
    .insert(assinaturaTogglesAdminTable)
    .values({ id: 1 })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  const again = await db
    .select()
    .from(assinaturaTogglesAdminTable)
    .where(eq(assinaturaTogglesAdminTable.id, 1))
    .limit(1);
  return again[0]!;
}

// ---------------------------------------------------------------------------
// enviar()
// ---------------------------------------------------------------------------
export interface EnviarAssinaturaInput {
  pacienteId: number;
  /** Template registrado em assinatura_templates.codigo (RAS/TCLE/termo). */
  templateCodigo?: string;
  /** HTML cru do documento, alternativa ao template. */
  conteudoHtml?: string;
  /** RAS | TCLE | TERMO | OUTRO — roteia pasta no Drive e nomeia o PDF. */
  tipoDoc?: string;
  titulo?: string;
  /** Pares para substituir {{CHAVE}} no corpo. */
  dados?: Record<string, string>;
  /** Inclui o médico como signatário ICP-Brasil (QUALIFICADA). */
  incluirMedico?: boolean;
  /** Signatários extras (ex.: médico/testemunha) além do paciente. */
  signatariosExtras?: Signatario[];
  canais?: CanalDistribuicao[];
  externalId?: string;
  metadataExtra?: Record<string, unknown>;
}

export interface EnviarAssinaturaResultado {
  solicitacaoId: number;
  envelopeId: string;
  status: SolicitacaoStatus;
  mock: boolean;
  links: Array<{ email: string; url: string }>;
  linkPaciente?: string;
}

function hidratar(corpo: string, dados: Record<string, string>): string {
  let out = corpo;
  for (const [k, v] of Object.entries(dados)) {
    out = out.replaceAll(`{{${k}}}`, v ?? "");
  }
  return out;
}

export async function enviarAssinatura(
  input: EnviarAssinaturaInput,
): Promise<EnviarAssinaturaResultado> {
  await ensureZapsignTokenLoaded();
  const toggles = await ensureToggles();

  // 1. Paciente (clients).
  const pacRows = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, input.pacienteId))
    .limit(1);
  const paciente = pacRows[0];
  if (!paciente) throw new Error("paciente_nao_encontrado");

  // Caso extremo 4: sem telefone E sem email -> não criar solicitação órfã.
  if (!paciente.phone && !paciente.email) {
    throw new Error("paciente_sem_canal: cliente nao tem telefone nem email para assinatura");
  }

  // 2. Conteúdo: template OU HTML cru.
  let templateId: number | undefined;
  let corpoHtml: string;
  let tipoDoc = input.tipoDoc || "TERMO";
  let titulo = input.titulo;
  let exigeMedico = !!input.incluirMedico;

  if (input.templateCodigo) {
    const tplRows = await db
      .select()
      .from(assinaturaTemplatesTable)
      .where(
        and(
          eq(assinaturaTemplatesTable.codigo, input.templateCodigo),
          eq(assinaturaTemplatesTable.ativo, true),
        ),
      )
      .limit(1);
    const tpl = tplRows[0];
    if (!tpl) throw new Error(`template_nao_encontrado: ${input.templateCodigo}`);
    templateId = tpl.id;
    corpoHtml = tpl.corpoHtml;
    tipoDoc = input.tipoDoc || tpl.tipoDoc;
    titulo = titulo || tpl.titulo;
    exigeMedico = exigeMedico || tpl.exigeMedico;
  } else if (input.conteudoHtml && input.conteudoHtml.trim()) {
    corpoHtml = input.conteudoHtml;
  } else {
    throw new Error("conteudo_ausente: informe templateCodigo ou conteudoHtml");
  }

  // 3. Hidratação de placeholders (dados explícitos + básicos do paciente).
  const dados: Record<string, string> = {
    NOME: paciente.name,
    CPF: paciente.cpf || "",
    EMAIL: paciente.email || "",
    DATA: new Date().toLocaleDateString("pt-BR"),
    ...(input.dados || {}),
  };
  const htmlHidratado = hidratar(corpoHtml, dados);
  const hashOriginal = createHash("sha256").update(htmlHidratado).digest("hex");

  // 4. PDF (ZapSign não aceita HTML cru).
  const pdfBase64 = await htmlParaPdfBase64(htmlHidratado);

  // 5. Signatários: paciente (AVANÇADA) + médico (QUALIFICADA) opcional.
  const signatarios: Signatario[] = [
    {
      papel: "PACIENTE",
      nome: paciente.name,
      cpf: paciente.cpf || undefined,
      email: paciente.email || undefined,
      telefone: paciente.phone || undefined,
      ordem: 1,
    },
  ];
  if (exigeMedico) {
    const medNome = process.env["MEDICO_NOME"];
    const medCpf = process.env["MEDICO_CPF"];
    const medEmail = process.env["MEDICO_EMAIL"];
    if (medNome && medCpf) {
      signatarios.push({
        papel: "MEDICO",
        nome: medNome,
        cpf: medCpf,
        email: medEmail || undefined,
        ordem: 2,
      });
    } else {
      logger.warn("[assinatura] incluirMedico pedido mas MEDICO_NOME/MEDICO_CPF ausentes — seguindo só com paciente");
    }
  }
  for (const extra of input.signatariosExtras || []) {
    signatarios.push(extra);
  }

  // 6. Envelope no provedor.
  const externalId =
    input.externalId || `${tipoDoc.toLowerCase()}-${input.pacienteId}-${Date.now()}`;
  const provedor = (toggles.provedorPrincipalCodigo || "zapsign") as ProvedorCodigo;
  const adapter = getAdapter(provedor);
  const mock = !adapter.isConfigured();

  const resultado = await adapter.createDocumentEnvelope({
    templateCodigo: input.templateCodigo || tipoDoc,
    conteudoHtml: htmlHidratado,
    pdfBase64,
    hashOriginal,
    signatarios,
    externalId,
    // Paxter é dono da fila de notificação: ZapSign NÃO dispara WhatsApp sozinho.
    enviarWhatsappAutomatico: false,
    ordemAssinaturaAtiva: signatarios.length > 1,
    metadata: { tipoDoc, pacienteId: input.pacienteId, ...(input.metadataExtra || {}) },
  });

  // 7. Persistir solicitação.
  const canais: string[] = input.canais || ["WHATSAPP"];
  const insSol = await db
    .insert(assinaturaSolicitacoesTable)
    .values({
      pacienteId: input.pacienteId,
      templateId: templateId ?? null,
      tipoDoc,
      titulo: titulo ?? null,
      provedorCodigo: provedor,
      provedorEnvelopeId: resultado.envelopeId,
      zapsignExternalId: externalId,
      status: "ENVIADO",
      dadosHidratacao: dados,
      hashOriginal,
      signatariosSnapshot: signatarios,
      canaisDistribuir: canais,
      metadata: { mock, ...(input.metadataExtra || {}) },
      enviadoEm: new Date(),
    })
    .returning({ id: assinaturaSolicitacoesTable.id });
  const solicitacaoId = insSol[0]!.id;

  // 8. Persistir signatários + casar link de assinatura por email.
  const linkPorEmail = new Map(
    resultado.linksAssinatura.map((l) => [l.email, l.url] as const),
  );
  for (const s of signatarios) {
    const link =
      (s.email && linkPorEmail.get(s.email)) ||
      resultado.linksAssinatura[s.ordem - 1]?.url ||
      undefined;
    await db.insert(assinaturaSignatariosTable).values({
      solicitacaoId,
      papel: s.papel,
      nome: s.nome,
      cpf: s.cpf ?? null,
      email: s.email ?? null,
      telefone: s.telefone ?? null,
      ordem: s.ordem,
      status: "ENVIADO",
      linkAssinatura: link ?? null,
    });
  }

  // 9. Fila de notificação ao paciente (link por WhatsApp) — processada por endpoint.
  const linkPaciente =
    (paciente.email && linkPorEmail.get(paciente.email)) ||
    resultado.linksAssinatura[0]?.url ||
    undefined;
  if (paciente.phone && linkPaciente) {
    const primeiroNome = paciente.name.split(" ")[0] || paciente.name;
    const corpo =
      `Ola ${primeiroNome}, o Instituto Padua preparou um documento para sua assinatura digital. ` +
      `Acesse com seguranca: ${linkPaciente}`;
    await db.insert(assinaturaNotificacoesTable).values({
      solicitacaoId,
      canal: "WHATSAPP",
      momento: "ENVIO_INICIAL",
      destinatario: paciente.phone,
      corpo,
      status: "PENDENTE",
    });
  }

  logger.info(
    { solicitacaoId, envelopeId: resultado.envelopeId, mock, tipoDoc },
    "[assinatura] solicitacao criada",
  );

  return {
    solicitacaoId,
    envelopeId: resultado.envelopeId,
    status: "ENVIADO",
    mock,
    links: resultado.linksAssinatura,
    linkPaciente,
  };
}

// ---------------------------------------------------------------------------
// receberWebhook()
// ---------------------------------------------------------------------------
export interface WebhookResultado {
  ok: boolean;
  eventoId: number;
  duplicado: boolean;
  transient?: boolean;
  unauthorized?: boolean;
}

export async function receberWebhook(
  provedor: ProvedorCodigo,
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
): Promise<WebhookResultado> {
  await ensureZapsignTokenLoaded();
  const adapter = getAdapter(provedor);
  const evento: EventoWebhook = await adapter.handleWebhook(rawBody, headers);

  const headerName = adapter.signatureHeaderName();
  const sigHeaderVal = headers[headerName] || headers[headerName.toLowerCase()];
  const sigHeaderStr = Array.isArray(sigHeaderVal) ? sigHeaderVal[0] : sigHeaderVal;

  // Inserção idempotente do evento (índice único provedor+event_id).
  const ins = await db
    .insert(assinaturaWebhookEventosTable)
    .values({
      provedorCodigo: provedor,
      eventId: evento.eventId,
      eventType: evento.eventType,
      envelopeId: evento.envelopeId ?? null,
      payloadBruto: evento.payload,
      signatureHeader: sigHeaderStr ?? null,
      signatureValida: evento.signatureValid,
      processado: false,
    })
    .onConflictDoNothing({
      target: [
        assinaturaWebhookEventosTable.provedorCodigo,
        assinaturaWebhookEventosTable.eventId,
      ],
    })
    .returning({ id: assinaturaWebhookEventosTable.id });

  let eventoId: number;
  if (ins.length === 0) {
    // Já existe: se processado=true é duplicado real; senão reprocessa.
    const ex = await db
      .select({
        id: assinaturaWebhookEventosTable.id,
        processado: assinaturaWebhookEventosTable.processado,
      })
      .from(assinaturaWebhookEventosTable)
      .where(
        and(
          eq(assinaturaWebhookEventosTable.provedorCodigo, provedor),
          eq(assinaturaWebhookEventosTable.eventId, evento.eventId),
        ),
      )
      .limit(1);
    const exRow = ex[0];
    if (!exRow) return { ok: true, eventoId: 0, duplicado: true };
    if (exRow.processado) return { ok: true, eventoId: exRow.id, duplicado: true };
    eventoId = exRow.id;
    await db
      .update(assinaturaWebhookEventosTable)
      .set({ erroProcessamento: null })
      .where(eq(assinaturaWebhookEventosTable.id, eventoId));
  } else {
    eventoId = ins[0]!.id;
  }

  // Caso extremo 2: assinatura inválida -> 401, não processa.
  // NÃO marca processado=true: marcar fecharia o eventId como "duplicado
  // terminal" e um evento LEGÍTIMO posterior com o mesmo id (retry assinado)
  // seria suprimido (DoS lógico). Registra só o erro e mantém reprocessável.
  if (!evento.signatureValid) {
    await db
      .update(assinaturaWebhookEventosTable)
      .set({ erroProcessamento: "signature_invalid" })
      .where(eq(assinaturaWebhookEventosTable.id, eventoId));
    return { ok: false, eventoId, duplicado: false, unauthorized: true };
  }

  // Roteamento por tipo de evento.
  const t = evento.eventType.toLowerCase();
  const isRecusado = /refus|reject|denied/.test(t);
  const isRemovido = /remov|delet|cancel|expir/.test(t);
  const isSucesso = !isRecusado && !isRemovido && /sign|close|finish|complet/.test(t);

  async function acharSolicitacaoPorEnvelope(envelopeId: string) {
    const rows = await db
      .select()
      .from(assinaturaSolicitacoesTable)
      .where(
        and(
          eq(assinaturaSolicitacoesTable.provedorEnvelopeId, envelopeId),
          eq(assinaturaSolicitacoesTable.provedorCodigo, provedor),
        ),
      )
      .limit(1);
    return rows[0];
  }

  try {
    if (evento.envelopeId && isRecusado) {
      const sol = await acharSolicitacaoPorEnvelope(evento.envelopeId);
      if (sol) {
        await db
          .update(assinaturaSolicitacoesTable)
          .set({ status: "REJEITADO" })
          .where(eq(assinaturaSolicitacoesTable.id, sol.id));
        await db
          .update(assinaturaWebhookEventosTable)
          .set({ solicitacaoId: sol.id })
          .where(eq(assinaturaWebhookEventosTable.id, eventoId));
        notificarCEO(sol.id, "REJEITADO").catch(() => {});
      }
    } else if (evento.envelopeId && isRemovido) {
      const sol = await acharSolicitacaoPorEnvelope(evento.envelopeId);
      if (sol) {
        await db
          .update(assinaturaSolicitacoesTable)
          .set({ status: "EXPIRADO" })
          .where(eq(assinaturaSolicitacoesTable.id, sol.id));
        await db
          .update(assinaturaWebhookEventosTable)
          .set({ solicitacaoId: sol.id })
          .where(eq(assinaturaWebhookEventosTable.id, eventoId));
      }
    } else if (evento.envelopeId && isSucesso) {
      const sol = await acharSolicitacaoPorEnvelope(evento.envelopeId);
      if (sol) {
        const pdf = await adapter.downloadSignedArtifact(evento.envelopeId);
        const hashAssinado = createHash("sha256").update(pdf).digest("hex");

        // Upload obrigatório (retenção legal). Se falhar: NÃO marca CONCLUIDO,
        // NÃO marca processado -> ZapSign reentrega até ack 200.
        let storageKey: string;
        try {
          const up = await uploadPdfAssinado(sol.zapsignExternalId || evento.envelopeId, pdf);
          storageKey = up.storageKey;
        } catch (uploadErr) {
          await db
            .update(assinaturaWebhookEventosTable)
            .set({ erroProcessamento: "pdf_upload_falhou: " + (uploadErr as Error).message })
            .where(eq(assinaturaWebhookEventosTable.id, eventoId));
          return { ok: false, eventoId, duplicado: false, transient: true };
        }

        await db
          .update(assinaturaSolicitacoesTable)
          .set({
            status: "CONCLUIDO",
            concluidoEm: new Date(),
            hashAssinado,
            pdfStorageKey: storageKey,
          })
          .where(eq(assinaturaSolicitacoesTable.id, sol.id));
        await db
          .update(assinaturaWebhookEventosTable)
          .set({ solicitacaoId: sol.id })
          .where(eq(assinaturaWebhookEventosTable.id, eventoId));

        // Caso extremo 5: arquivar no Drive é best-effort, nunca reverte status.
        arquivarNoDrive(sol.id, pdf).catch((e) =>
          logger.warn({ err: (e as Error).message, solicitacaoId: sol.id }, "[assinatura] arquivamento Drive falhou (best-effort)"),
        );

        // Notificação pós-assinatura (idempotente).
        const jaTem = await db
          .select({ id: assinaturaNotificacoesTable.id })
          .from(assinaturaNotificacoesTable)
          .where(
            and(
              eq(assinaturaNotificacoesTable.solicitacaoId, sol.id),
              eq(assinaturaNotificacoesTable.momento, "POS_ASSINATURA"),
            ),
          )
          .limit(1);
        if (jaTem.length === 0 && sol.pacienteId) {
          const pac = await db
            .select({ name: clientsTable.name, phone: clientsTable.phone })
            .from(clientsTable)
            .where(eq(clientsTable.id, sol.pacienteId))
            .limit(1);
          const p = pac[0];
          if (p?.phone) {
            const primeiroNome = p.name.split(" ")[0] || p.name;
            await db.insert(assinaturaNotificacoesTable).values({
              solicitacaoId: sol.id,
              canal: "WHATSAPP",
              momento: "POS_ASSINATURA",
              destinatario: p.phone,
              corpo: `Obrigado, ${primeiroNome}! Seu documento foi assinado e arquivado com seguranca pelo Instituto Padua.`,
              status: "PENDENTE",
            });
          }
        }
        notificarCEO(sol.id, "ASSINADO").catch(() => {});
      }
    }
  } catch (err) {
    await db
      .update(assinaturaWebhookEventosTable)
      .set({ erroProcessamento: (err as Error).message })
      .where(eq(assinaturaWebhookEventosTable.id, eventoId));
    return { ok: false, eventoId, duplicado: false, transient: true };
  }

  await db
    .update(assinaturaWebhookEventosTable)
    .set({ processado: true, processadoEm: new Date() })
    .where(eq(assinaturaWebhookEventosTable.id, eventoId));
  return { ok: true, eventoId, duplicado: false };
}

// ---------------------------------------------------------------------------
// Pós-assinatura: arquivar no Drive (best-effort) + avisar CEO.
// ---------------------------------------------------------------------------
async function arquivarNoDrive(solicitacaoId: number, pdf: Buffer): Promise<void> {
  const rows = await db
    .select()
    .from(assinaturaSolicitacoesTable)
    .where(eq(assinaturaSolicitacoesTable.id, solicitacaoId))
    .limit(1);
  const sol = rows[0];
  if (!sol || !sol.pacienteId) return;
  const pac = await db
    .select({ name: clientsTable.name, driveFolderId: clientsTable.driveFolderId })
    .from(clientsTable)
    .where(eq(clientsTable.id, sol.pacienteId))
    .limit(1);
  const folderId = pac[0]?.driveFolderId;
  if (!folderId) return;
  const data = new Date();
  const yy = String(data.getFullYear()).slice(2);
  const mm = String(data.getMonth() + 1).padStart(2, "0");
  const dd = String(data.getDate()).padStart(2, "0");
  const nomeArq = `${yy}.${mm}.${dd} ${sol.tipoDoc} ASSINADO ${(pac[0]?.name || "").toUpperCase()}.pdf`;
  const up = await uploadFileToDrive(folderId, nomeArq, "application/pdf", pdf, true);
  await db
    .update(assinaturaSolicitacoesTable)
    .set({ driveFileId: up.fileId })
    .where(eq(assinaturaSolicitacoesTable.id, solicitacaoId));
}

async function notificarCEO(solicitacaoId: number, tipo: "ASSINADO" | "REJEITADO"): Promise<void> {
  const ceoPhone = process.env["CEO_WHATSAPP"];
  const msg = `Paxter: documento da solicitacao #${solicitacaoId} foi ${tipo}.`;
  if (ceoPhone) {
    await sendWhatsapp(ceoPhone, msg).catch(() => {});
  }
  logger.info({ solicitacaoId, tipo }, "[assinatura] evento notificado ao CEO");
}

// ---------------------------------------------------------------------------
// Timeline (DTO para tela / curl).
// ---------------------------------------------------------------------------
export async function listarTimeline(limite = 200) {
  const rows = await db
    .select({
      id: assinaturaSolicitacoesTable.id,
      pacienteId: assinaturaSolicitacoesTable.pacienteId,
      pacienteNome: clientsTable.name,
      tipoDoc: assinaturaSolicitacoesTable.tipoDoc,
      titulo: assinaturaSolicitacoesTable.titulo,
      status: assinaturaSolicitacoesTable.status,
      provedorCodigo: assinaturaSolicitacoesTable.provedorCodigo,
      envelopeId: assinaturaSolicitacoesTable.provedorEnvelopeId,
      enviadoEm: assinaturaSolicitacoesTable.enviadoEm,
      concluidoEm: assinaturaSolicitacoesTable.concluidoEm,
      criadoEm: assinaturaSolicitacoesTable.criadoEm,
    })
    .from(assinaturaSolicitacoesTable)
    .leftJoin(clientsTable, eq(clientsTable.id, assinaturaSolicitacoesTable.pacienteId))
    .orderBy(desc(assinaturaSolicitacoesTable.criadoEm))
    .limit(limite);
  return rows;
}

// ---------------------------------------------------------------------------
// PDF assinado (para a rota GET /:id/pdf-assinado, já com requireCollaborator).
// ---------------------------------------------------------------------------
export async function obterPdfAssinado(
  solicitacaoId: number,
): Promise<{ buffer: Buffer; filename: string } | null> {
  const rows = await db
    .select()
    .from(assinaturaSolicitacoesTable)
    .where(eq(assinaturaSolicitacoesTable.id, solicitacaoId))
    .limit(1);
  const sol = rows[0];
  if (!sol || !sol.pdfStorageKey) return null;
  const buffer = await readPdfAssinado(sol.pdfStorageKey);
  const filename = `assinatura-${sol.id}-${sol.tipoDoc}.pdf`;
  return { buffer, filename };
}

// ---------------------------------------------------------------------------
// Templates (Cartório Onda 1) — biblioteca de modelos reutilizáveis.
// ---------------------------------------------------------------------------
export interface UpsertTemplateInput {
  codigo: string;
  titulo?: string;
  tipoDoc?: string;
  corpoHtml: string;
  placeholders?: string[];
  exigeMedico?: boolean;
  ativo?: boolean;
}

export async function listarTemplates() {
  return db
    .select()
    .from(assinaturaTemplatesTable)
    .orderBy(desc(assinaturaTemplatesTable.atualizadoEm));
}

/** Cria ou atualiza um template por `codigo` (idempotente — caso extremo 4 da spec). */
export async function upsertTemplate(input: UpsertTemplateInput) {
  const codigo = (input.codigo || "").trim();
  if (!codigo) throw new Error("codigo_ausente: informe o codigo do template");
  if (!input.corpoHtml || !input.corpoHtml.trim()) {
    throw new Error("conteudo_ausente: informe o corpo do template");
  }
  const values = {
    codigo,
    titulo: (input.titulo || "").trim() || codigo,
    tipoDoc: input.tipoDoc || "TERMO",
    corpoHtml: input.corpoHtml,
    placeholders: input.placeholders ?? [],
    exigeMedico: !!input.exigeMedico,
    ativo: input.ativo ?? true,
  };
  const rows = await db
    .insert(assinaturaTemplatesTable)
    .values(values)
    .onConflictDoUpdate({
      target: assinaturaTemplatesTable.codigo,
      set: {
        titulo: values.titulo,
        tipoDoc: values.tipoDoc,
        corpoHtml: values.corpoHtml,
        placeholders: values.placeholders,
        exigeMedico: values.exigeMedico,
        ativo: values.ativo,
      },
    })
    .returning();
  return rows[0]!;
}

// ---------------------------------------------------------------------------
// Worker da fila de notificações (endpoint chama; sem cron externo).
// ---------------------------------------------------------------------------
export async function processarNotificacoes(limite = 50) {
  const pend = await db
    .select()
    .from(assinaturaNotificacoesTable)
    .where(eq(assinaturaNotificacoesTable.status, "PENDENTE"))
    .orderBy(assinaturaNotificacoesTable.criadoEm)
    .limit(limite);

  let enviadas = 0;
  let falhas = 0;
  for (const n of pend) {
    try {
      if (n.canal === "WHATSAPP") {
        const r = await sendWhatsapp(n.destinatario, n.corpo);
        if (!r.sent) throw new Error(r.error || "falha_whatsapp");
      }
      // DRIVE: arquivamento já é inline no webhook; aqui só fecha o registro.
      await db
        .update(assinaturaNotificacoesTable)
        .set({ status: "ENVIADO", enviadoEm: new Date(), erro: null })
        .where(eq(assinaturaNotificacoesTable.id, n.id));
      enviadas++;
    } catch (e) {
      await db
        .update(assinaturaNotificacoesTable)
        .set({ status: "FALHA", erro: (e as Error).message })
        .where(eq(assinaturaNotificacoesTable.id, n.id));
      falhas++;
    }
  }
  return { processadas: pend.length, enviadas, falhas };
}
