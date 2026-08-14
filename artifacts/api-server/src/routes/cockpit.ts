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
} from "@workspace/db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
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
import { sendWhatsapp, registrarLogMensagem } from "../lib/whatsapp";
import { sendTelegram } from "../lib/telegram";
import { inboxRouter } from "./telegram-inbox";
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
  const empresaId = resolveEmpresaId(req);
  const [cliente] = await db
    .select({
      id: clientsTable.id,
      name: clientsTable.name,
      phone: clientsTable.phone,
      email: clientsTable.email,
      telegramChatId: clientsTable.telegramChatId,
    })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clienteId), eq(clientsTable.empresaId, empresaId)))
    .limit(1);
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

  // Ultima mensagem por canal — WhatsApp e Telegram são consultados separadamente
  // para que o cockpit possa exibir o último contato de cada canal.
  const [ultimoLogWa] = await db
    .select({ criadoEm: whatsappMensagensLogTable.criadoEm })
    .from(whatsappMensagensLogTable)
    .where(
      and(
        eq(whatsappMensagensLogTable.clienteId, clienteId),
        eq(whatsappMensagensLogTable.via, "whatsapp"),
      ),
    )
    .orderBy(desc(whatsappMensagensLogTable.criadoEm))
    .limit(1);

  const [ultimoLogTg] = await db
    .select({ criadoEm: whatsappMensagensLogTable.criadoEm })
    .from(whatsappMensagensLogTable)
    .where(
      and(
        eq(whatsappMensagensLogTable.clienteId, clienteId),
        eq(whatsappMensagensLogTable.via, "telegram"),
      ),
    )
    .orderBy(desc(whatsappMensagensLogTable.criadoEm))
    .limit(1);

  res.json({
    cliente: {
      id: cliente.id,
      nome: cliente.name,
      telefone: cliente.phone ?? null,
      email: cliente.email ?? null,
      telegramLinked: cliente.telegramChatId != null,
      ultimoContatoWhatsappAt: ultimoLogWa?.criadoEm?.toISOString() ?? null,
      ultimoContatoTelegramAt: ultimoLogTg?.criadoEm?.toISOString() ?? null,
      /** @deprecated use ultimoContatoWhatsappAt / ultimoContatoTelegramAt */
      ultimoContatoAt: (ultimoLogWa?.criadoEm ?? ultimoLogTg?.criadoEm)?.toISOString() ?? null,
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
  const empresaId = resolveEmpresaId(req);
  const [cliente] = await db
    .select({ id: clientsTable.id, name: clientsTable.name })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clienteId), eq(clientsTable.empresaId, empresaId)))
    .limit(1);
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
  const empresaId = resolveEmpresaId(req);
  const [cliente] = await db
    .select({ id: clientsTable.id, name: clientsTable.name, phone: clientsTable.phone })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clienteId), eq(clientsTable.empresaId, empresaId)))
    .limit(1);
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
// interno já roda a cada minuto). Devolve {ok:true} como ack.
router.post("/mensageria/processar", async (_req, res): Promise<void> => {
  res.json({ ok: true, info: "motor rico ativo — cron interno gerencia os disparos" });
});

// ============================================================================
// INBOX TELEGRAM — montado a partir de routes/telegram-inbox.ts
// As 3 rotas (badge, listar, marcar-lidas) vivem naquele arquivo para
// que possam ser testadas com escopo mínimo de dependências (supertest).
// ============================================================================
// 5) badge + listar + marcar-lidas: delegados ao inboxRouter (routes/telegram-inbox.ts)
// Testados de forma isolada via supertest (task 110).
router.use(inboxRouter);

// 6-A) POST /cockpit/:clientId/telegram-inbox/enviar
// Envia uma mensagem de texto do CEO ao paciente via Telegram e registra no log.
// Requer token de colaborador. Só funciona se o paciente tem telegramChatId.
router.post("/cockpit/:clientId/telegram-inbox/enviar", requireCollaborator, async (req, res): Promise<void> => {
  const clienteId = Number(req.params.clientId);
  if (!Number.isFinite(clienteId) || clienteId <= 0) {
    res.status(400).json({ error: "clientId invalido" });
    return;
  }

  const texto: string = (req.body?.texto ?? "").trim();
  if (!texto) {
    res.status(400).json({ error: "texto obrigatorio" });
    return;
  }
  if (texto.length > 4096) {
    res.status(400).json({ error: "texto muito longo (max 4096 caracteres)" });
    return;
  }

  const empresaId = resolveEmpresaId(req);

  // Busca cliente e verifica pertencimento ao tenant
  const [cliente] = await db
    .select({ id: clientsTable.id, telegramChatId: clientsTable.telegramChatId })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clienteId), eq(clientsTable.empresaId, empresaId)))
    .limit(1);

  if (!cliente) {
    res.status(404).json({ error: "cliente nao encontrado" });
    return;
  }

  const chatId = cliente.telegramChatId;
  if (!chatId) {
    res.status(422).json({ error: "paciente nao tem Telegram vinculado" });
    return;
  }

  const resultado = await sendTelegram(chatId, texto);

  // Persiste saúde do chatId do paciente: true = entregue, false = falhou.
  // Só registra quando a chamada foi real (não mock) — mock não prova nada sobre o chatId.
  // Await garante que o GET /clients/:id seguinte já vê o valor atualizado.
  if (!resultado.mock) {
    const testOk = resultado.sent;
    try {
      await db.execute(sql`UPDATE clients SET telegram_last_test_ok = ${testOk} WHERE id = ${clienteId}`);
    } catch (e: unknown) {
      console.warn("[cockpit/enviar] falha ao persistir telegram_last_test_ok:", e);
    }
  }

  if (!resultado.sent && !resultado.mock) {
    res.status(502).json({ error: resultado.error ?? "falha ao enviar pelo Telegram" });
    return;
  }

  // Registra envio no inbox com direcao='saida'
  await db.execute(sql`
    INSERT INTO telegram_inbox_messages (empresa_id, cliente_id, chat_id, texto, recebida_em, direcao)
    VALUES (${empresaId}, ${clienteId}, ${chatId}, ${texto}, NOW(), 'saida')
  `);

  // Registra no log unificado de mensagens (via='telegram') para o cockpit
  // poder exibir "último contato Telegram". Só loga quando enviado com sucesso.
  if (resultado.sent) {
    void registrarLogMensagem({
      telefone: chatId, // chatId como identificador de canal Telegram
      corpo: texto,
      status: "sent",
      contexto: "cockpit_telegram",
      clienteId,
      via: "telegram",
    });
  }

  res.json({ ok: true, sent: resultado.sent, mock: resultado.mock });
});

// ── GET /cockpit/:clientId/mensageria ────────────────────────────────────────
// Histórico de mensagens enviadas ao paciente (mensageria_lembrete, tipo radar
// e lembretes). Apenas o tenant correto pode ler (empresaId isolado).
router.get("/cockpit/:clientId/mensageria", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = resolveEmpresaId(req as any);
  const clienteId = Number(req.params.clientId);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    res.status(400).json({ error: "clientId inválido" });
    return;
  }

  // Confirma que o cliente pertence ao tenant
  const [cliente] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clienteId), eq(clientsTable.empresaId, empresaId)))
    .limit(1);
  if (!cliente) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  const rows = await db.execute(sql`
    SELECT
      id,
      tipo,
      titulo,
      mensagem,
      via,
      status,
      enviado_em,
      created_at
    FROM mensageria_lembrete
    WHERE cliente_id = ${clienteId}
      AND empresa_id = ${empresaId}
      AND status = 'enviado'
      AND enviado_em IS NOT NULL
    ORDER BY enviado_em DESC
    LIMIT 50
  `);

  res.json({ mensagens: rows.rows });
});

export default router;
