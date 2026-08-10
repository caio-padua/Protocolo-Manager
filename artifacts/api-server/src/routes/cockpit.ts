import { Router } from "express";
import { moduleGuard } from "../middleware/moduleGuard";
import { requireCollaborator } from "./collaborator";
import { resolveEmpresaId } from "../middleware/tenantContext";
import {
  db,
  clientsTable,
  budgetsTable,
  protocolsTable,
  anamneseRespostaTable,
  perguntaDoencaTable,
  itemDoencaTable,
  catalogoDoencasTable,
  whatsappMensagensLogTable,
  telegramInboxTable,
} from "@workspace/db";
import { eq, and, inArray, desc, isNull, sql } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  computeMotor,
  gatilhoBate,
  type RespostaMotor,
} from "../lib/motor-anamnese";
import {
  sincronizarLembretePrescricao,
  executarLembretesPeriodo,
  type ItemLembretePrescricao,
} from "../lib/lembrete-periodo";
import { enriquecerItemFormula } from "../lib/formula-manipulada";
import { sendWhatsapp } from "../lib/whatsapp";

const router = Router();
router.use(moduleGuard("cockpit"));

// ============================================================================
// COCKPIT DA CONSULTA — ONDA E do Master Loop Paxter.
//
// O Cockpit e BURRO: ele so consolida e exibe o DTO (Data Transfer Object,
// objeto de transferencia de dados) que o Cerebro (motor-anamnese) monta. Tres
// colunas: PASSADO (historico), PRESENTE (escore/doencas vivas) e FUTURO
// (prescricao sugerida: formulas, exames, injetaveis, implantes, dieta, treino).
//
// O motor de calculo NAO e alterado por estetica (linha vermelha): o Cockpit so
// LE o resultado de computeMotor e re-deriva as doencas acesas com o MESMO
// gatilhoBate para puxar os itens amarrados (item_doenca).
// ============================================================================

type ItemFuturo = { id: number; nome: string; ref: string | null; peso: number };

// Re-deriva os ids das doencas acesas usando o MESMO gatilho do motor (sem
// tocar no motor). Necessario porque computeMotor devolve nomes, e aqui
// precisamos dos ids para puxar os itens amarrados (item_doenca).
async function doencasAcesasIds(respostas: RespostaMotor[]): Promise<number[]> {
  const mapResp = new Map<string, string | number>();
  for (const r of respostas) mapResp.set(r.perguntaId, r.valor);
  const amarr = await db.select().from(perguntaDoencaTable);
  const ids = new Set<number>();
  for (const a of amarr) {
    if (!mapResp.has(a.perguntaId)) continue;
    if (gatilhoBate(a.gatilhoValor, mapResp.get(a.perguntaId)!)) ids.add(a.doencaIdIhe);
  }
  return Array.from(ids);
}

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

function itensPorTipo(rows: (typeof itemDoencaTable.$inferSelect)[], tipo: string): ItemFuturo[] {
  return rows
    .filter((r) => r.itemTipo === tipo)
    .map((r) => ({ id: r.id, nome: r.itemNome ?? r.itemRef ?? "—", ref: r.itemRef ?? null, peso: r.peso ?? 1 }));
}

// 1) GET /cockpit/:clientId — monta o DTO consolidado das 3 colunas.
router.get("/cockpit/:clientId", async (req, res): Promise<void> => {
  const clienteId = Number(req.params.clientId);
  if (!Number.isInteger(clienteId)) {
    res.status(400).json({ error: "clientId invalido" });
    return;
  }
  const [cliente] = await db.select().from(clientsTable).where(eq(clientsTable.id, clienteId));
  if (!cliente) {
    res.status(404).json({ error: "cliente nao encontrado" });
    return;
  }

  const respostas = await carregarRespostas(clienteId);
  const presente = await computeMotor(respostas);
  const acesasIds = await doencasAcesasIds(respostas);

  let itensAmarrados: (typeof itemDoencaTable.$inferSelect)[] = [];
  if (acesasIds.length) {
    itensAmarrados = await db
      .select()
      .from(itemDoencaTable)
      .where(inArray(itemDoencaTable.doencaIdIhe, acesasIds));
  }

  const protocolos = await db
    .select({ id: protocolsTable.id, status: protocolsTable.status, createdAt: protocolsTable.createdAt })
    .from(protocolsTable)
    .where(eq(protocolsTable.clientId, clienteId));

  const orcamentos = await db
    .select({ id: budgetsTable.id, title: budgetsTable.title, status: budgetsTable.status, totalCents: budgetsTable.totalCents })
    .from(budgetsTable)
    .where(eq(budgetsTable.clientId, clienteId));

  // Ultima mensagem enviada ao paciente (qualquer canal — log unico da plataforma).
  const [ultimoLog] = await db
    .select({ criadoEm: whatsappMensagensLogTable.criadoEm })
    .from(whatsappMensagensLogTable)
    .where(eq(whatsappMensagensLogTable.clienteId, clienteId))
    .orderBy(desc(whatsappMensagensLogTable.criadoEm))
    .limit(1);

  res.json({
    cliente: {
      id: cliente.id,
      nome: cliente.name,
      telefone: cliente.phone ?? null,
      email: cliente.email ?? null,
      telegramLinked: cliente.telegramChatId != null,
      ultimoContatoAt: ultimoLog?.criadoEm?.toISOString() ?? null,
    },
    passado: {
      protocolos,
      orcamentos,
      respostasAnamnese: respostas.length,
    },
    presente: {
      escoreTotal: presente.escoreTotal,
      gradeGlobal: presente.gradeGlobal,
      redFlag: presente.redFlag,
      blocos: presente.blocos,
      sintomas: presente.sintomas,
      doencas: presente.doencas,
      alarmes: presente.alarmes,
    },
    futuro: {
      formulas: itensPorTipo(itensAmarrados, "formula"),
      exames: presente.exames.map((nome, i) => ({ id: i, nome, ref: null, peso: 1 })),
      injetaveis: itensPorTipo(itensAmarrados, "injetavel"),
      implantes: itensPorTipo(itensAmarrados, "implante"),
      dieta: presente.sugestaoDieta,
      treino: presente.sugestaoTreino,
    },
  });
});

// 2) GET /cockpit/:clientId/pdf — PDF consolidado da consulta (passado/presente/futuro).
router.get("/cockpit/:clientId/pdf", async (req, res): Promise<void> => {
  const clienteId = Number(req.params.clientId);
  if (!Number.isInteger(clienteId)) {
    res.status(400).json({ error: "clientId invalido" });
    return;
  }
  const [cliente] = await db.select().from(clientsTable).where(eq(clientsTable.id, clienteId));
  if (!cliente) {
    res.status(404).json({ error: "cliente nao encontrado" });
    return;
  }

  const respostas = await carregarRespostas(clienteId);
  const presente = await computeMotor(respostas);

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595, 842]); // A4 retrato
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.086, 0.157, 0.29);
  const gold = rgb(0.722, 0.573, 0.302);
  let y = 800;

  const linha = (txt: string, f = font, size = 11, color = rgb(0.1, 0.1, 0.1)) => {
    if (y < 50) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    page.drawText(txt, { x: 50, y, size, font: f, color });
    y -= size + 6;
  };

  page.drawRectangle({ x: 0, y: 802, width: 595, height: 40, color: navy });
  page.drawText("PAXTER — RESUMO DA CONSULTA", { x: 50, y: 814, size: 16, font: bold, color: gold });
  y = 770;
  linha(`Cliente: ${cliente.name}`, bold, 13, navy);
  linha(`Data: ${new Date().toLocaleDateString("pt-BR")}`);
  y -= 6;
  linha("PRESENTE (Cerebro)", bold, 13, gold);
  linha(`Escore total: ${presente.escoreTotal}  |  Grade: ${presente.gradeGlobal}${presente.redFlag ? "  |  SINAL DE ALARME" : ""}`);
  linha(`Doencas vivas: ${presente.doencas.join(", ") || "—"}`);
  linha(`Sintomas: ${presente.sintomas.join(", ") || "—"}`);
  y -= 6;
  linha("FUTURO (Prescricao sugerida)", bold, 13, gold);
  linha(`Exames: ${presente.exames.slice(0, 12).join(", ") || "—"}`);
  if (presente.sugestaoDieta) linha(`Dieta: ${presente.sugestaoDieta.objetivoSugerido} (${presente.sugestaoDieta.estiloSugerido ?? "—"})`);
  if (presente.sugestaoTreino) linha(`Treino: ${presente.sugestaoTreino.objetivoSugerido} (${presente.sugestaoTreino.divisaoSugerida ?? "—"})`);

  const bytes = await pdf.save();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="cockpit-${clienteId}.pdf"`);
  res.end(Buffer.from(bytes));
});

// 3) POST /cockpit/:clientId/emitir — "Finalizar e Emitir Tudo".
//    Aprova orcamentos, agenda lembretes e dispara o resumo na mensageria.
router.post("/cockpit/:clientId/emitir", async (req, res): Promise<void> => {
  const clienteId = Number(req.params.clientId);
  if (!Number.isInteger(clienteId)) {
    res.status(400).json({ error: "clientId invalido" });
    return;
  }
  const [cliente] = await db.select().from(clientsTable).where(eq(clientsTable.id, clienteId));
  if (!cliente) {
    res.status(404).json({ error: "cliente nao encontrado" });
    return;
  }

  const respostas = await carregarRespostas(clienteId);
  const presente = await computeMotor(respostas);
  const acesasIds = await doencasAcesasIds(respostas);
  let itensAmarrados: (typeof itemDoencaTable.$inferSelect)[] = [];
  if (acesasIds.length) {
    itensAmarrados = await db.select().from(itemDoencaTable).where(inArray(itemDoencaTable.doencaIdIhe, acesasIds));
  }

  // a) APROVAR ORCAMENTOS: presented -> accepted (preenche acceptedAt).
  const pendentes = await db
    .select()
    .from(budgetsTable)
    .where(and(eq(budgetsTable.clientId, clienteId), eq(budgetsTable.status, "presented")));
  const now = new Date();
  let aprovados = 0;
  for (const b of pendentes) {
    await db
      .update(budgetsTable)
      .set({ status: "accepted", acceptedAt: now, updatedAt: now })
      .where(eq(budgetsTable.id, b.id));
    aprovados += 1;
  }

  // b) ALIMENTAR O MOTOR RICO DE LEMBRETE POR PERÍODO (lembretes_prescricao).
  // Traduz os itens da prescrição em períodos canônicos do IHE. O motor simples
  // (mensageria.ts) está APOSENTADO — não é mais alimentado aqui.
  const itensLembrete: ItemLembretePrescricao[] = [];
  for (const f of itensAmarrados.filter((r) => r.itemTipo === "formula"))
    itensLembrete.push(...(await enriquecerItemFormula(f.itemRef, f.itemNome ?? f.itemRef ?? "Formula")));
  for (const inj of itensAmarrados.filter((r) => r.itemTipo === "injetavel"))
    itensLembrete.push({ tipo: "injetavel", nome: inj.itemNome ?? inj.itemRef ?? "Injetavel" });
  for (const ex of presente.exames.slice(0, 10))
    itensLembrete.push({ tipo: "exame", nome: ex });

  // Efeitos colaterais externos isolados (Onda H): uma falha de servico externo
  // (mensageria/Twilio/ZapSign) NAO pode derrubar a emissao nem perder a
  // aprovacao dos orcamentos. Cada chamada roda via Promise.allSettled e degrada
  // com graca. Lembretes vem antes do WhatsApp porque o resumo cita a contagem.
  let lembretes = { formulas: 0, periodos: 0, horarios: [] as string[], ativo: false };
  const [lembRes] = await Promise.allSettled([sincronizarLembretePrescricao(clienteId, itensLembrete)]);
  if (lembRes.status === "fulfilled") {
    lembretes = {
      formulas: lembRes.value.formulas,
      periodos: lembRes.value.periodos,
      horarios: lembRes.value.horarios,
      ativo: lembRes.value.ativo,
    };
  } else {
    req.log.error({ err: String(lembRes.reason) }, "[cockpit] falha ao sincronizar lembretes");
  }

  // c) ENVIAR RESUMO p/ MENSAGERIA (WhatsApp; fallback link quando sem Twilio).
  const resumoMsg =
    `PAXTER | ${cliente.name}: consulta finalizada. Grade ${presente.gradeGlobal}. ` +
    `${aprovados} orcamento(s) aprovado(s), lembretes em ${lembretes.periodos} periodo(s) do dia. ` +
    `Em breve voce recebera os lembretes das suas formulas, exames e injetaveis.`;
  let whatsapp: { sent: boolean; via: string; link: string } = { sent: false, via: "link", link: "" };
  if (cliente.phone) {
    const [waRes] = await Promise.allSettled([sendWhatsapp(cliente.phone, resumoMsg)]);
    if (waRes.status === "fulfilled") {
      whatsapp = { sent: waRes.value.sent, via: waRes.value.via, link: waRes.value.link };
    } else {
      req.log.error({ err: String(waRes.reason) }, "[cockpit] falha ao enviar WhatsApp");
    }
  }

  res.json({
    ok: true,
    cliente: { id: cliente.id, nome: cliente.name },
    orcamentosAprovados: aprovados,
    lembretes,
    pdfUrl: `/api/cockpit/${clienteId}/pdf`,
    whatsapp,
  });
});

// 4) POST /mensageria/processar — worker/cron dispara os lembretes por período.
// Mantido por compatibilidade; o disparo real agora é o motor rico (o cron
// interno já roda a cada minuto). Devolve {examinados,enviados,falhas,pulados}.
router.post("/mensageria/processar", async (_req, res): Promise<void> => {
  const resultado = await executarLembretesPeriodo();
  res.json(resultado);
});

// ============================================================================
// INBOX TELEGRAM — mensagens recebidas dos pacientes via bot
// ============================================================================

// 5) GET /cockpit/:clientId/telegram-inbox
// Lista mensagens Telegram do paciente. Requer token de colaborador.
// Tenant derivado de req.tenantContext (resolveEmpresaId) — nunca do clientId
// fornecido pelo chamador. Escopo: empresaId autorizado × clienteId solicitado.
router.get("/cockpit/:clientId/telegram-inbox", requireCollaborator, async (req, res): Promise<void> => {
  const clienteId = Number(req.params.clientId);
  if (!Number.isFinite(clienteId) || clienteId <= 0) {
    res.status(400).json({ error: "clientId invalido" });
    return;
  }

  // empresaId vem do contexto de sessão (tenantContextMiddleware), não do chamador
  const empresaId = resolveEmpresaId(req);

  // Confirma que o cliente pertence ao tenant autorizado — bloqueio cross-tenant
  const [clienteNoTenant] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clienteId), eq(clientsTable.empresaId, empresaId)))
    .limit(1);

  if (!clienteNoTenant) {
    res.status(404).json({ error: "cliente nao encontrado" });
    return;
  }

  // Filtro triplo: clienteId + empresaId da sessão — sem dependência dos dados do cliente
  const filtro = and(
    eq(telegramInboxTable.clienteId, clienteId),
    eq(telegramInboxTable.empresaId, empresaId),
  );

  const mensagens = await db
    .select()
    .from(telegramInboxTable)
    .where(filtro)
    .orderBy(desc(telegramInboxTable.recebidaEm))
    .limit(100);

  // Marca como lidas quando o front requisita (query param marcar_lidas=1)
  if (req.query["marcar_lidas"] === "1") {
    await db
      .update(telegramInboxTable)
      .set({ lidaEm: new Date() })
      .where(and(filtro, isNull(telegramInboxTable.lidaEm)));
  }

  const naoLidas = mensagens.filter((m) => m.lidaEm == null).length;

  res.json({
    mensagens: mensagens.map((m) => ({
      id: m.id,
      texto: m.texto,
      recebidaEm: m.recebidaEm.toISOString(),
      lida: m.lidaEm != null,
    })),
    naoLidas,
  });
});

// 6) POST /cockpit/:clientId/telegram-inbox/marcar-lidas
// Marca não-lidas do paciente como lidas. Requer token de colaborador.
// Tenant derivado de req.tenantContext — escopo obrigatório no UPDATE.
router.post("/cockpit/:clientId/telegram-inbox/marcar-lidas", requireCollaborator, async (req, res): Promise<void> => {
  const clienteId = Number(req.params.clientId);
  if (!Number.isFinite(clienteId) || clienteId <= 0) {
    res.status(400).json({ error: "clientId invalido" });
    return;
  }

  const empresaId = resolveEmpresaId(req);

  // Verifica pertencimento ao tenant antes de qualquer escrita
  const [clienteNoTenant] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clienteId), eq(clientsTable.empresaId, empresaId)))
    .limit(1);

  if (!clienteNoTenant) {
    res.status(404).json({ error: "cliente nao encontrado" });
    return;
  }

  const resultado = await db
    .update(telegramInboxTable)
    .set({ lidaEm: new Date() })
    .where(and(
      eq(telegramInboxTable.clienteId, clienteId),
      eq(telegramInboxTable.empresaId, empresaId), // tenant da sessão, não do payload
      isNull(telegramInboxTable.lidaEm),
    ));

  res.json({ ok: true, marcadas: (resultado as any).rowCount ?? 0 });
});

// 7) GET /telegram-inbox/badge
// Conta não-lidas do tenant autorizado. Requer token de colaborador.
// empresaId vem de req.tenantContext — colaboradores de outro tenant nunca veem
// mensagens alheias, mesmo que o banco tenha múltiplas empresas.
router.get("/telegram-inbox/badge", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = resolveEmpresaId(req);

  const [row] = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(telegramInboxTable)
    .where(and(
      isNull(telegramInboxTable.lidaEm),
      eq(telegramInboxTable.empresaId, empresaId), // isolamento por tenant da sessão
    ));

  res.json({ naoLidas: row?.total ?? 0 });
});

export default router;
