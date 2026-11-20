/** Atendimento por IA com SQL real em BANCO DESCARTÁVEL (socket em /tmp; nunca toca DATABASE_URL). Dados sintéticos. */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const h = vi.hoisted(() => ({ db: null as any, enviados: [] as { chat: string; texto: string }[], settings: {} as Record<string, string>,
  noEnvio:null as null|((chat:string)=>Promise<void>), pg: null as any,
  asaasChargeCount: 0,
  aprendizResposta: '{"pergunta":"Qual é o horário da clínica?"}' }));
vi.mock("@workspace/db", () => ({
  db: { execute: (...a: unknown[]) => h.db.execute(...a) },
  // O crédito da mensageria usa o mesmo banco descartável (Instituto, empresa 5, é isento).
  pool: { query: (...a: unknown[]) => h.pg.query(...a), connect: () => h.pg.connect() },
}));
vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: { messages: { create: async () => ({
    content: [{ type: "text", text: h.aprendizResposta }], usage: { input_tokens: 8, output_tokens: 4 },
  }) } },
}));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("../lib/secure-settings", () => ({
  getSetting: async (k: string) => h.settings[k] ?? null,
  getSecretStatus: async (k: string) => ({
    isSet: Boolean(h.settings[k]),
    masked: null,
    source: h.settings[k] ? "env" : null,
    updatedAt: null,
  }),
}));
vi.mock("../lib/telegram", () => ({ sendTelegram: async (chat: string, texto: string) => { h.enviados.push({ chat, texto }); await h.noEnvio?.(chat); return { sent: true, mock: false }; } }));
vi.mock("../lib/asaas", () => ({
  asaasCreateCustomer: async () => ({ id: "asaas-customer-synthetic" }),
  asaasCreateCharge: async (input: { value: number; externalReference: string }) => {
    h.asaasChargeCount += 1;
    return {
      id: `asaas-charge-synthetic-${input.externalReference}`,
      invoiceUrl: "https://asaas.example/synthetic",
      billingType: "UNDEFINED",
      status: "PENDING",
      value: input.value,
      externalReference: input.externalReference,
    };
  },
  asaasGetCharge: async () => ({}),
}));
vi.mock("../lib/telegram-config", () => ({ chatAlertaOuNull: async () => "ALERTA" }));
vi.mock("../lib/ai-central", () => ({ requireAiTenant: () => ({ headers: {} }) }));
vi.mock("../lib/clinical-document-share", () => ({
  getIssuedDocument: async (_type: string, id: number) => ({
    id,
    clientId: 1,
    professionalId: 42,
    prescriptionId: 5001,
    status: "emitted",
    signatureStatus: "signed",
    issuedAt: "2026-11-20",
    pdfData: "JVBERi1zeW50aGV0aWM=",
    fileName: "receita.pdf",
    label: "Receituário de demonstração",
    empresaId: 5,
    locationId: 10,
  }),
  listIssuedDocumentsForClient: async () => {
    const recipes = await h.pg.query("SELECT id,title FROM recipes WHERE prescription_id=5001 ORDER BY id");
    return recipes.rows.map((row: { id: number; title: string }) => ({
      documentType: "prescricao",
      documentId: row.id,
      label: row.title,
      issuedAt: "2026-11-20",
      signatureStatus: "signed",
      pdfSha256: "synthetic-hash",
      professionalId: 42,
    }));
  },
  criarTokenClinicalShare: () => ({
    token: "a".repeat(43),
    tokenHash: "66d34fba71f8f450f7e45598853e53bfc23bbd129027cbb131a2f4ffd7878cd0",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }),
  hashClinicalShareToken: () => "66d34fba71f8f450f7e45598853e53bfc23bbd129027cbb131a2f4ffd7878cd0",
}));

import { aplicarMigracaoAtendimento, depsReaisAtendimento, pausarParaHumano, devolverParaIA, lerConfigAtendimento,
  atenderMensagemTelegram,processarAtendimentosPendentes,pausarAtendimentoDuravel } from "../lib/atendimento-telegram-store";
import { processarAtendimento, type PlanoAtendimento } from "../lib/atendimento-telegram";
import { responderSobreDocumentoTelegram, respostaDocumentoAindaAtual } from "../lib/atendimento-telegram-documentos";
import {
  autorizarOfertaReenvio, autorizarConfirmacaoReenvio, marcarOfertaReenvioEntregue,
  enviarLinkReceitaConfirmada,
} from "../lib/atendimento-telegram-reenvio";
import {
  alterarEstadoFaqAprendida, buscarFaqAprendida, editarFaqAprendida, listarFaqAprendidas,
  listarVersoesFaqAprendida, observarRespostaAprovada, registrarResolucaoTelegram, registrarUsoFaqAprendida,
} from "../lib/telegram-aprendiz";
import { aplicarMigracaoUpdateId } from "../lib/telegram-inbox-migracao";

const PG_BIN = process.env.PG_BIN_DIR ?? "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin";
let dir = ""; let proc: ChildProcess | null = null; let pool: pg.Pool;
const base = { empresaId: 5, clienteId: 1, clienteNome: "Paciente Sintetico", chatId: "C1" };

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pgatend-"));
  const dados = join(dir, "dados");
  execFileSync(join(PG_BIN, "initdb"), ["-D", dados, "-A", "trust", "-U", "teste"], { stdio: "ignore" });
  proc = spawn(join(PG_BIN, "postgres"), ["-D", dados, "-c", "listen_addresses=", "-k", dir, "-c", "max_connections=60"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) { if (existsSync(join(dir, ".s.PGSQL.5432"))) break; await new Promise((r) => setTimeout(r, 250)); }
  pool = new pg.Pool({ host: dir, user: "teste", database: "postgres", max: 30 });
  for (let i = 0; i < 80; i++) { try { await pool.query("SELECT 1"); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  await pool.query(`CREATE TABLE clients(
      id integer primary key,empresa_id integer,location_id integer DEFAULT 10,name text,
      telegram_chat_id text,asaas_customer_id text,cpf text,email text,phone text,
      status text NOT NULL DEFAULT 'active',deleted_at timestamptz
    );
    INSERT INTO clients(id,empresa_id,name,cpf,asaas_customer_id,telegram_chat_id)
      VALUES(1,5,'Cliente sintético','12345678901','asaas-customer-synthetic','C1'),
            (2,5,'Cliente alternativo','12345678902',NULL,'C2'),
            (3,7,'Outro cliente','12345678903',NULL,'C3');
    CREATE TABLE prescriptions(id integer primary key,client_id integer,empresa_id integer,status text,emitted_at timestamptz);
    CREATE TABLE prescription_items(id serial primary key,prescription_id integer,name text,dose text,order_index integer DEFAULT 0);
    CREATE TABLE recipes(id integer primary key,title text,prescription_id integer,pdf_data text);
    CREATE TABLE protocols(id integer primary key,client_id integer,empresa_id integer,title text,status text,
      start_date text,end_date text,updated_at timestamptz DEFAULT NOW());
    INSERT INTO prescriptions(id,client_id,empresa_id,status,emitted_at) VALUES(5001,1,5,'emitted',NOW());
    INSERT INTO prescription_items(prescription_id,name,dose,order_index) VALUES
      (5001,'Vitamina X','dose sintética não deve aparecer',0);
    INSERT INTO recipes(id,title,prescription_id,pdf_data)
      VALUES(6001,'Receituário de demonstração',5001,'JVBERi1zeW50aGV0aWM=');
    INSERT INTO protocols(id,client_id,empresa_id,title,status,start_date,end_date)
      VALUES(7001,1,5,'Protocolo de suporte','active','2020-01-01','2099-12-31');
    CREATE TABLE telegram_inbox_messages (id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL DEFAULT 0, cliente_id INTEGER NOT NULL,
    chat_id TEXT NOT NULL, texto TEXT NOT NULL, recebida_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), lida_em TIMESTAMPTZ, direcao TEXT NOT NULL DEFAULT 'entrada', update_id BIGINT)`);
  await pool.query(`CREATE TABLE payments(
    id SERIAL PRIMARY KEY,client_id INTEGER,protocol_id INTEGER,amount REAL,method TEXT,status TEXT,
    due_date TEXT,paid_at TEXT,description TEXT,installments INTEGER,card_label TEXT,provider TEXT,
    asaas_charge_id TEXT UNIQUE,asaas_invoice_url TEXT,pix_qr_code TEXT,pix_copy_paste TEXT,
    boleto_url TEXT,billing_type TEXT,stripe_charge_id TEXT,stripe_checkout_url TEXT,
    empresa_id INTEGER,created_at TIMESTAMPTZ DEFAULT NOW())`);
  h.db = drizzle(pool);
  h.pg = pool;
  const { ensureClinicalDocumentReissuesTable } = await import("../lib/ensure-clinical-document-reissues");
  await ensureClinicalDocumentReissuesTable();
  await pool.query(`INSERT INTO clinical_document_reissue_settings
    (empresa_id,location_id,enabled,fee_collection_enabled,require_human_review,fee_amount)
    VALUES(5,10,TRUE,FALSE,FALSE,15.00)`);
  await aplicarMigracaoUpdateId(h.db);
  await aplicarMigracaoAtendimento(h.db);
  await pool.query(`INSERT INTO orientacoes_aprovadas (empresa_id,tema,perguntas_exemplo,resposta,status) VALUES
    (5,'Jejum antes do exame','preciso de jejum para exame de sangue, quantas horas de jejum','APROVADA: jejum de 8 horas.','aprovada'),
    (5,'Jejum rascunho','jejum exame sangue horas rascunho','RASCUNHO NAO PODE SAIR','rascunho'),
    (7,'Jejum outra clinica','jejum exame sangue horas de jejum','OUTRA CLINICA NAO PODE SAIR','aprovada')`);
  await pool.query(`INSERT INTO orientacoes_aprovadas
    (empresa_id,tema,perguntas_exemplo,resposta,status,categoria,subcategoria) VALUES
      (5,'Fórmula: Vitamina X','explique vitamina x','Texto aprovado sobre a finalidade da fórmula.','aprovada','prescricao','formula_explicacao'),
      (5,'Protocolo: Protocolo de suporte','explique protocolo de suporte','Texto aprovado sobre o protocolo.','aprovada','prescricao','protocolo_explicacao')`);
  h.settings = {
    "atendimento.ia.modo": "ligado",
    "telegram.active": "true",
    "telegram.botToken": "synthetic-telegram-token",
  };
}, 60000);
beforeEach(() => {
  h.enviados = [];
  h.noEnvio = null;
  h.asaasChargeCount = 0;
});
afterAll(async () => { await pool?.end(); proc?.kill("SIGTERM"); if (dir) rmSync(dir, { recursive: true, force: true }); });

const run = (id: number, texto: string, over: Partial<typeof base> = {}) =>
  processarAtendimento(depsReaisAtendimento(5), { ...base, ...over, inboxMessageId: id, texto });

describe("SQL real", () => {
  it("migração é idempotente", async () => { await aplicarMigracaoAtendimento(h.db); await aplicarMigracaoAtendimento(h.db); });

  it("aprende só após três perguntas seguras, repete sem duplicar e não cruza clínicas", async () => {
    const orient = await pool.query(`INSERT INTO orientacoes_aprovadas
      (empresa_id,tema,perguntas_exemplo,resposta,status,categoria,subcategoria)
      VALUES(5,'Horário da clínica','horário funcionamento','A clínica atende das oito às dezoito horas.','aprovada','gerais','atendimento')
      RETURNING id`);
    const orientacaoId = Number(orient.rows[0].id);
    const questions = [
      "Qual é o horário da clínica?",
      "Qual é o horário da clínica hoje?",
      "Qual é o horário da clínica agora?",
    ];
    for (let i = 0; i < questions.length; i++) {
      await observarRespostaAprovada({ empresaId: 5, inboxMessageId: 501 + i, textoPergunta: questions[i]!, orientacaoId });
    }
    await observarRespostaAprovada({ empresaId: 5, inboxMessageId: 501, textoPergunta: questions[0]!, orientacaoId });
    const faq = await buscarFaqAprendida(5, questions[0]!);
    expect(faq).toEqual({ id: expect.any(Number), resposta: "A clínica atende das oito às dezoito horas." });
    expect(await buscarFaqAprendida(7, questions[0]!)).toBeNull();
    const quantidade = await pool.query(`SELECT COUNT(*)::int n FROM telegram_faq_observacoes WHERE empresa_id=5 AND orientacao_id=$1`, [orientacaoId]);
    expect(quantidade.rows[0].n).toBe(3);
    await registrarUsoFaqAprendida(5, faq!.id, 601);
    await registrarUsoFaqAprendida(5, faq!.id, 601);
    const usos = await pool.query(`SELECT usos,economia_ia FROM telegram_faq_aprendidas WHERE id=$1`, [faq!.id]);
    expect(usos.rows[0]).toEqual({ usos: "1", economia_ia: "1" });
    await pool.query(`UPDATE orientacoes_aprovadas SET status='inativa' WHERE id=$1`, [orientacaoId]);
    expect(await buscarFaqAprendida(5, questions[0]!)).toBeNull();
    await pool.query(`UPDATE orientacoes_aprovadas SET status='aprovada' WHERE id=$1`, [orientacaoId]);
    expect(await editarFaqAprendida({
      empresaId:5, id:faq!.id, pergunta:questions[0]!, variacoes:questions,
      resposta:"A clínica atende de segunda a sexta, das oito às dezoito horas.", por:"42",
    })).toBe(true);
    expect(await buscarFaqAprendida(5, questions[0]!)).toEqual({
      id:faq!.id, resposta:"A clínica atende de segunda a sexta, das oito às dezoito horas.",
    });
    expect(await alterarEstadoFaqAprendida({ empresaId:7, id:faq!.id, ativa:false, por:"77" })).toBe(false);
    await alterarEstadoFaqAprendida({ empresaId:5, id:faq!.id, ativa:false, por:"42" });
    expect(await buscarFaqAprendida(5, questions[0]!)).toBeNull();
    await alterarEstadoFaqAprendida({ empresaId:5, id:faq!.id, ativa:true, por:"42" });
    const versoes = await listarVersoesFaqAprendida(5, faq!.id);
    expect(versoes.length).toBeGreaterThanOrEqual(3);
    expect(await listarVersoesFaqAprendida(7, faq!.id)).toHaveLength(0);
    await registrarResolucaoTelegram({ empresaId:5, inboxMessageId:701, caminho:"cardapio" });
    await registrarResolucaoTelegram({ empresaId:5, inboxMessageId:701, caminho:"equipe", interpreteChamado:true });
    const metricas = await pool.query(`SELECT COUNT(*)::int n,caminho,interprete_chamado FROM telegram_ia_resolucoes WHERE empresa_id=5 AND inbox_message_id=701 GROUP BY caminho,interprete_chamado`);
    expect(metricas.rows).toEqual([{ n:1,caminho:"cardapio",interprete_chamado:false }]);
    await alterarEstadoFaqAprendida({ empresaId:5, id:faq!.id, remover:true, por:"42" });
    expect(await buscarFaqAprendida(5, questions[0]!)).toBeNull();
    expect(await listarFaqAprendidas(5)).toHaveLength(0);
  });

  it("só orientação APROVADA da PRÓPRIA empresa sai; envia, grava saída e desfecho", async () => {
    h.enviados.length = 0;
    expect(await run(101, "quantas horas de jejum para o exame de sangue?")).toBe("orientacao_enviada");
    expect(h.enviados).toEqual([{ chat: "C1", texto: "APROVADA: jejum de 8 horas." }]);
    const s = await pool.query(`SELECT direcao, texto FROM telegram_inbox_messages`);
    expect(s.rows).toEqual([{ direcao: "saida", texto: "APROVADA: jejum de 8 horas." }]);
    const r = await pool.query(`SELECT desfecho FROM telegram_atendimento_respostas WHERE inbox_message_id=101`);
    expect(r.rows[0].desfecho).toBe("orientacao_enviada");
  });

  it("20 entregas simultâneas da mesma mensagem = 1 resposta", async () => {
    h.enviados.length = 0;
    const rs = await Promise.all(Array.from({ length: 20 }, () => run(102, "quantas horas de jejum para o exame de sangue?")));
    expect(rs.filter((x) => x === "orientacao_enviada")).toHaveLength(1);
    expect(rs.filter((x) => x === "ja_tratado")).toHaveLength(19);
    expect(h.enviados.filter((e) => e.chat === "C1")).toHaveLength(1);
  });

  it("profissional assumiu = pausa; devolver à IA retoma", async () => {
    await pausarParaHumano(h.db, 1, "profissional_assumiu", 6);
    h.enviados.length = 0;
    expect(await run(103, "quantas horas de jejum para o exame de sangue?")).toBe("pausado_humano");
    expect(h.enviados).toHaveLength(0);
    await devolverParaIA(h.db, 1, 6);
    expect(await run(104, "quantas horas de jejum para o exame de sangue?")).toBe("orientacao_enviada");
  });

  it("queixa clínica pausa a IA, alerta com prioridade e não envia texto antes da revisão", async () => {
    await devolverParaIA(h.db, 2, null);
    h.enviados.length = 0;
    expect(await run(105, "passei mal depois da aplicação, muita tontura", { clienteId: 2, chatId: "C2" })).toBe("queixa_encaminhada");
    expect(h.enviados.map((e) => e.chat)).toEqual(["ALERTA"]);
    expect(h.enviados[0].texto).toMatch(/PRIORIDADE/);
    const m = await pool.query(`SELECT modo, motivo FROM telegram_atendimento WHERE cliente_id=2`);
    expect(m.rows[0]).toEqual({ modo: "humano", motivo: "queixa_clinica" });
    // próxima mensagem da mesma pessoa não recebe resposta automática (IA pausada)
    expect(await run(106, "quantas horas de jejum para o exame de sangue?", { clienteId: 2, chatId: "C2" })).toBe("pausado_humano");
  });

  it("configuração ilegível ou ausente = desligado", async () => {
    h.settings = {};
    expect((await lerConfigAtendimento()).modo).toBe("desligado");
    h.settings = { "atendimento.ia.modo": "lista", "atendimento.ia.permitidos": "{x" };
    expect((await lerConfigAtendimento()).modo).toBe("desligado");
    h.settings = { "atendimento.ia.modo": "ligado" };
  });
});

describe("documentos clínicos no Telegram", () => {
  const entradaDocumento = (texto: string) => ({
    empresaId: 5,
    clienteId: 1,
    clienteNome: "Cliente sintético",
    chatId: "C1",
    inboxMessageId: 900,
    texto,
  });

  it("explica somente a fórmula exata aprovada e oferece segunda via sem expor dose", async () => {
    const resultado = await responderSobreDocumentoTelegram(h.db, entradaDocumento("Explique a Fórmula Vitamina X"));
    expect(resultado).toMatchObject({
      tipo: "resposta",
      texto: "Texto aprovado sobre a finalidade da fórmula.\n\nSe quiser a segunda via deste receituário, responda somente “quero a segunda via”.",
      orientacaoId: expect.any(Number),
      documento: { acao: "ofertar_reenvio", receitaId: 6001, prescricaoId: 5001 },
    });
    expect(resultado?.texto).not.toContain("dose sintética não deve aparecer");
  });

  it("oferece segunda via após pedido explícito, sem enviá-la antes da confirmação", async () => {
    const resultado = await responderSobreDocumentoTelegram(h.db, entradaDocumento("Quero segunda via do meu receituário"));
    expect(resultado).toMatchObject({
      tipo: "resposta",
      desfecho: "reenvio_receita_ofertado",
      documento: { acao: "ofertar_reenvio", documentType: "prescricao", documentId: 6001, receitaId: 6001 },
    });
    expect(resultado?.texto).toContain("responda somente “sim” ou “pode enviar”");
  });

  it("explica protocolo apenas com a orientação aprovada de título correspondente", async () => {
    const resultado = await responderSobreDocumentoTelegram(h.db, entradaDocumento("Explique meu protocolo"));
    expect(resultado).toMatchObject({
      tipo: "resposta",
      texto: "Texto aprovado sobre o protocolo.",
      orientacaoId: expect.any(Number),
    });
  });

  it("não procura cliente por nome quando o vínculo Telegram se torna ambíguo", async () => {
    await pool.query("UPDATE clients SET telegram_chat_id='C1' WHERE id=2");
    try {
      const resultado = await responderSobreDocumentoTelegram(h.db, entradaDocumento("Explique a Fórmula Vitamina X"));
      expect(resultado).toMatchObject({ tipo: "encaminhar", motivo: "identidade_telegram_nao_confirmada" });
    } finally {
      await pool.query("UPDATE clients SET telegram_chat_id='C2' WHERE id=2");
    }
  });

  it("encaminha quando existem várias fórmulas ou mais de um arquivo de receita", async () => {
    const segundoItem = await pool.query(`INSERT INTO prescription_items(prescription_id,name,dose,order_index)
      VALUES(5001,'Mineral Y','dose sintética privada',1) RETURNING id`);
    try {
      const variasFormulas = await responderSobreDocumentoTelegram(h.db, entradaDocumento("Explique minha fórmula do receituário"));
      expect(variasFormulas).toMatchObject({ tipo: "resposta", desfecho: "clarificacao_documento" });
      expect(variasFormulas?.texto).toContain("Mineral Y");
      expect(variasFormulas?.texto).not.toContain("dose sintética privada");
    } finally {
      await pool.query("DELETE FROM prescription_items WHERE id=$1", [segundoItem.rows[0].id]);
    }

    await pool.query(`INSERT INTO recipes(id,title,prescription_id,pdf_data)
      VALUES(6002,'Segunda receita',5001,'JVBERi1zeW50aGV0aWM=')`);
    try {
      const segundaVia = await responderSobreDocumentoTelegram(h.db, entradaDocumento("Quero segunda via do receituário"));
      expect(segundaVia).toMatchObject({ tipo: "resposta", desfecho: "clarificacao_documento" });
      expect(segundaVia?.texto).toContain("Receituário de demonstração");
      expect(segundaVia?.texto).toContain("Segunda receita");
    } finally {
      await pool.query("DELETE FROM recipes WHERE id=6002");
    }
  });

  it("encaminha quando a explicação exata foi inativada", async () => {
    await pool.query("UPDATE orientacoes_aprovadas SET status='inativa' WHERE tema='Fórmula: Vitamina X'");
    try {
      const resultado = await responderSobreDocumentoTelegram(h.db, entradaDocumento("Explique a Fórmula Vitamina X"));
      expect(resultado).toMatchObject({
        tipo: "encaminhar",
        motivo: "explicacao_de_formula_sem_fonte_exata_aprovada",
      });
    } finally {
      await pool.query("UPDATE orientacoes_aprovadas SET status='aprovada' WHERE tema='Fórmula: Vitamina X'");
    }
  });

  it("revalida a fórmula e a orientação depois do planejamento e antes do envio", async () => {
    const e = entradaDocumento("Explique a Fórmula Vitamina X");
    const respostaPlanejada = await responderSobreDocumentoTelegram(h.db, e);
    expect(respostaPlanejada?.tipo).toBe("resposta");
    if (respostaPlanejada?.tipo !== "resposta") return;
    const plano: PlanoAtendimento = {
      pausa: null,
      alerta: null,
      resposta: respostaPlanejada.texto,
      orientacaoId: respostaPlanejada.orientacaoId ?? null,
      desfecho: respostaPlanejada.desfecho,
      caminhoResolucao: "documento",
      ...(respostaPlanejada.documento ? { documento: respostaPlanejada.documento } : {}),
    };
    expect(await respostaDocumentoAindaAtual(h.db, e, plano)).toBe(true);
    await pool.query("UPDATE prescription_items SET name='Nome alterado' WHERE prescription_id=5001");
    expect(await respostaDocumentoAindaAtual(h.db, e, plano)).toBe(false);
    await pool.query("UPDATE prescription_items SET name='Vitamina X' WHERE prescription_id=5001");
    await pool.query("UPDATE orientacoes_aprovadas SET status='inativa' WHERE tema='Fórmula: Vitamina X'");
    try {
      expect(await respostaDocumentoAindaAtual(h.db, e, plano)).toBe(false);
    } finally {
      await pool.query("UPDATE orientacoes_aprovadas SET status='aprovada' WHERE tema='Fórmula: Vitamina X'");
    }
  });

  it("exige confirmação em oferta vigente e encaminha confirmação vencida", async () => {
    await pool.query(`INSERT INTO telegram_documento_reenvios
      (empresa_id,cliente_id,chat_id,recipe_id,prescription_id,pdf_sha256,oferta_inbox_message_id,status,expira_em)
      VALUES(5,1,'C1',6001,5001,'synthetic-hash',901,'oferecido',NOW()+interval '1 hour')`);
    const confirmacao = await responderSobreDocumentoTelegram(h.db, entradaDocumento("sim"));
    expect(confirmacao).toMatchObject({
      tipo: "resposta",
      documento: { acao: "confirmar_reenvio", ofertaId: expect.any(Number) },
    });
    await pool.query("UPDATE telegram_documento_reenvios SET expira_em=NOW()-interval '1 minute' WHERE oferta_inbox_message_id=901");
    const vencida = await responderSobreDocumentoTelegram(h.db, entradaDocumento("sim"));
    expect(vencida).toMatchObject({ tipo: "encaminhar", motivo: "confirmacao_de_reenvio_sem_oferta_vigente" });
  });

  it("vincula a oferta ao PDF atual e só aceita uma confirmação por mensagem", async () => {
    const ofertaEntrada = entradaDocumento("Explique a Fórmula Vitamina X");
    ofertaEntrada.inboxMessageId = 902;
    const ofertaPlano: PlanoAtendimento = {
      pausa: null,
      alerta: null,
      resposta: "Posso enviar a segunda via?",
      orientacaoId: null,
      desfecho: "reenvio_receita_ofertado",
      caminhoResolucao: "documento",
      documento: { acao: "ofertar_reenvio", receitaId: 6001, prescricaoId: 5001, titulo: "Receituário de demonstração" },
    };
    expect(await autorizarOfertaReenvio(h.db, ofertaEntrada, ofertaPlano)).toBe(true);
    await marcarOfertaReenvioEntregue(ofertaEntrada);

    const confirmacaoEntrada = entradaDocumento("sim");
    confirmacaoEntrada.inboxMessageId = 903;
    const ofertaReal = await pool.query("SELECT id,reissue_request_id FROM telegram_documento_reenvios WHERE oferta_inbox_message_id=902");
    const confirmacaoPlano: PlanoAtendimento = {
      ...ofertaPlano,
      resposta: "Confirmado.",
      desfecho: "reenvio_receita_confirmado",
      documento: {
        acao: "confirmar_reenvio",
        documentType: "prescricao",
        documentId: 6001,
        reissueRequestId: String(ofertaReal.rows[0].reissue_request_id),
        receitaId: 6001,
        prescricaoId: 5001,
        ofertaId: Number(ofertaReal.rows[0].id),
      },
    };
    expect(await autorizarConfirmacaoReenvio(h.db, confirmacaoEntrada, confirmacaoPlano)).toBe(true);
    expect(await autorizarConfirmacaoReenvio(h.db, confirmacaoEntrada, confirmacaoPlano)).toBe(true);
    const outraConfirmacao = { ...confirmacaoEntrada, inboxMessageId: 904 };
    expect(await autorizarConfirmacaoReenvio(h.db, outraConfirmacao, confirmacaoPlano)).toBe(false);
    expect((await pool.query("SELECT status FROM telegram_documento_reenvios WHERE oferta_inbox_message_id=902")).rows[0].status).toBe("enviando");

    await pool.query(`INSERT INTO telegram_atendimento_respostas(inbox_message_id,estado,dono,etapas)
      VALUES(903,'processando','owner-903','{"resposta":{"estado":"enviando"}}')`);
    const baseAnterior = process.env.PUBLIC_BASE_URL;
    process.env.PUBLIC_BASE_URL = "https://paxmed.example";
    try {
      const envio = await enviarLinkReceitaConfirmada("C1", confirmacaoEntrada, confirmacaoPlano, "owner-903");
      expect(envio.sent).toBe(true);
      expect(envio.textoHistorico).not.toContain("a".repeat(43));
      expect(h.enviados.at(-1)?.texto).toContain("/api/clinical-documents/share/");
      const tokenSalvo = await pool.query(`SELECT delivery_share_token_hash,delivery_share_expires_at
        FROM clinical_document_reissue_requests WHERE id=$1`, [confirmacaoPlano.documento!.reissueRequestId]);
      expect(tokenSalvo.rows[0]).toEqual({
        delivery_share_token_hash: expect.any(String),
        delivery_share_expires_at: expect.any(Date),
      });
    } finally {
      if (baseAnterior === undefined) delete process.env.PUBLIC_BASE_URL;
      else process.env.PUBLIC_BASE_URL = baseAnterior;
    }
  });
});

describe("política de segunda via", () => {
  const baseRequest = {
    clientId: 1,
    empresaId: 5,
    locationId: 10,
    documentType: "prescricao" as const,
    documentId: 6001,
    requestedByChannel: "telegram" as const,
    clientConsent: false,
  };

  it("não cobra quando a assinatura PaxMed Members não pode ser verificada", async () => {
    await pool.query("UPDATE protocols SET start_date='2020-01-01',end_date='2020-02-01' WHERE id=7001");
    try {
      const { createReissueRequest } = await import("../lib/clinical-document-reissue-policy");
      const result = await createReissueRequest({
        ...baseRequest,
        operationKey: "00000000-0000-4000-8000-000000000101",
      });
      expect(result).toMatchObject({
        eligibility: "human_review",
        status: "awaiting_review",
        feeAmount: null,
        paymentStatus: "unverified",
      });
    } finally {
      await pool.query("UPDATE protocols SET start_date='2020-01-01',end_date='2099-12-31' WHERE id=7001");
    }
  });

  it("cobra somente depois da autorização explícita e congela a taxa da solicitação", async () => {
    await pool.query("UPDATE protocols SET start_date='2020-01-01',end_date='2020-02-01' WHERE id=7001");
    await pool.query("UPDATE clinical_document_reissue_settings SET fee_collection_enabled=TRUE WHERE empresa_id=5 AND location_id=10");
    try {
      const { createReissueRequest, confirmClinicalDocumentReissueRequest } =
        await import("../lib/clinical-document-reissue-policy");
      const created = await createReissueRequest({
        ...baseRequest,
        operationKey: "00000000-0000-4000-8000-000000000102",
        membershipVerification: "inactive_or_unpaid",
      });
      expect(created).toMatchObject({
        eligibility: "fee_required",
        status: "awaiting_confirmation",
        feeAmount: 15,
        paymentStatus: "awaiting_consent",
      });
      const confirmed = await confirmClinicalDocumentReissueRequest({
        requestId: created.id,
        clientId: 1,
        empresaId: 5,
        locationId: 10,
        confirmationMessageId: 777,
      });
      expect(confirmed).toMatchObject({
        status: "awaiting_payment",
        paymentStatus: "unverified",
        feeAmount: 15,
      });
      const saved = await pool.query(
        "SELECT asaas_charge_id,fee_amount FROM clinical_document_reissue_requests WHERE id=$1",
        [created.id],
      );
      expect(saved.rows[0]).toEqual({ asaas_charge_id: null, fee_amount: "15.00" });
    } finally {
      await pool.query("UPDATE protocols SET start_date='2020-01-01',end_date='2099-12-31' WHERE id=7001");
      await pool.query("UPDATE clinical_document_reissue_settings SET fee_collection_enabled=FALSE WHERE empresa_id=5 AND location_id=10");
    }
  });

  it("pagamento simulado: sem pagamento não entrega; pago e aprovado entrega uma única vez a cópia exata", async () => {
    await pool.query("UPDATE protocols SET start_date='2020-01-01',end_date='2020-02-01' WHERE id=7001");
    await pool.query("UPDATE clinical_document_reissue_settings SET fee_collection_enabled=TRUE WHERE empresa_id=5 AND location_id=10");
    process.env.PUBLIC_BASE_URL = "https://paxmed.example";
    try {
      const { createReissueRequest, confirmClinicalDocumentReissueRequest } =
        await import("../lib/clinical-document-reissue-policy");
      const { createAndSendReissueCharge } = await import("../lib/clinical-document-reissue-billing");
      const { deliverApprovedClinicalDocumentReissue } = await import("../lib/atendimento-telegram-reenvio");
      const { createHash } = await import("node:crypto");
      const created = await createReissueRequest({
        ...baseRequest, operationKey: "00000000-0000-4000-8000-000000000104",
        membershipVerification: "inactive_or_unpaid",
      });
      await confirmClinicalDocumentReissueRequest({
        requestId: created.id, clientId: 1, empresaId: 5, locationId: 10, confirmationMessageId: 779,
      });
      await pool.query("UPDATE clinical_document_reissue_requests SET delivery_share_token_hash=NULL WHERE delivery_share_token_hash IS NOT NULL");
      await createAndSendReissueCharge(created.id, "C1");
      h.enviados = [];
      const antes = await deliverApprovedClinicalDocumentReissue(created.id);
      expect(antes.sent).toBe(false);
      expect(h.enviados).toHaveLength(0);
      const sha = createHash("sha256").update(Buffer.from("JVBERi1zeW50aGV0aWM=", "base64")).digest("hex");
      // Mesmo efeito do webhook PAYMENT_CONFIRMED (revisão humana desligada).
      await pool.query(`UPDATE clinical_document_reissue_requests SET payment_status='paid',paid_at=NOW(),
        request_status='approved',require_human_review=FALSE,document_pdf_sha256=$2 WHERE id=$1`, [created.id, sha]);
      const [a, b] = await Promise.all([
        deliverApprovedClinicalDocumentReissue(created.id),
        deliverApprovedClinicalDocumentReissue(created.id),
      ]);
      expect([a.sent, b.sent].filter(Boolean)).toHaveLength(1);
      expect(h.enviados.filter((m) => m.texto.includes("Abrir documento"))).toHaveLength(1);
    } finally {
      delete process.env.PUBLIC_BASE_URL;
      await pool.query("UPDATE protocols SET start_date='2020-01-01',end_date='2099-12-31' WHERE id=7001");
      await pool.query("UPDATE clinical_document_reissue_settings SET fee_collection_enabled=FALSE WHERE empresa_id=5 AND location_id=10");
    }
  });

  it("cria uma cobrança de forma idempotente apenas depois do consentimento e nunca entrega antes do pagamento", async () => {
    await pool.query("UPDATE protocols SET start_date='2020-01-01',end_date='2020-02-01' WHERE id=7001");
    await pool.query("UPDATE clinical_document_reissue_settings SET fee_collection_enabled=TRUE WHERE empresa_id=5 AND location_id=10");
    try {
      const { createReissueRequest, confirmClinicalDocumentReissueRequest } =
        await import("../lib/clinical-document-reissue-policy");
      const { createAndSendReissueCharge } = await import("../lib/clinical-document-reissue-billing");
      const created = await createReissueRequest({
        ...baseRequest,
        operationKey: "00000000-0000-4000-8000-000000000103",
        membershipVerification: "inactive_or_unpaid",
      });
      expect(created.status).toBe("awaiting_confirmation");
      await confirmClinicalDocumentReissueRequest({
        requestId: created.id, clientId: 1, empresaId: 5, locationId: 10,
        confirmationMessageId: 778,
      });
      const first = await createAndSendReissueCharge(created.id, "C1");
      const second = await createAndSendReissueCharge(created.id, "C1");
      expect(first).toMatchObject({ sent: true, invoiceUrl: "https://asaas.example/synthetic" });
      expect(second.sent).toBe(false);
      expect(h.asaasChargeCount).toBe(1);
      expect(h.enviados.at(-1)?.texto).toContain("Pagar taxa");
      expect(h.enviados.at(-1)?.texto).not.toContain("Abrir documento");
      const saved = await pool.query(
        "SELECT payment_status,asaas_charge_id,asaas_invoice_url FROM clinical_document_reissue_requests WHERE id=$1",
        [created.id],
      );
      expect(saved.rows[0]).toMatchObject({
        payment_status: "pending",
        asaas_charge_id: `asaas-charge-synthetic-paxmed_reissue:${created.id}`,
        asaas_invoice_url: "https://asaas.example/synthetic",
      });
    } finally {
      await pool.query("UPDATE protocols SET start_date='2020-01-01',end_date='2099-12-31' WHERE id=7001");
      await pool.query("UPDATE clinical_document_reissue_settings SET fee_collection_enabled=FALSE WHERE empresa_id=5 AND location_id=10");
    }
  });
});

describe("conferência humana, consentimento, reenvio manual e escopo de emissão", () => {
  const baseRequest = {
    clientId: 1, empresaId: 5, locationId: 10, documentType: "prescricao" as const,
    documentId: 6001, requestedByChannel: "telegram" as const, clientConsent: false,
  };
  const entrada = (texto: string, inboxMessageId: number) => ({
    empresaId: 5, clienteId: 1, clienteNome: "Cliente sintético", chatId: "C1", inboxMessageId, texto,
  });
  const limpar = async (feeEnabled: boolean, humanReview: boolean) => {
    await pool.query("UPDATE telegram_documento_reenvios SET status='cancelado' WHERE status IN ('ofertando','oferecido','enviando')");
    await pool.query("UPDATE protocols SET start_date='2020-01-01',end_date='2020-02-01' WHERE id=7001");
    await pool.query(`UPDATE clinical_document_reissue_settings SET enabled=TRUE,fee_collection_enabled=$1,
      require_human_review=$2 WHERE empresa_id=5 AND location_id=10`, [feeEnabled, humanReview]);
    h.enviados = [];
    h.asaasChargeCount = 0;
    process.env.PUBLIC_BASE_URL = "https://paxmed.example";
  };
  const restaurar = async () => {
    delete process.env.PUBLIC_BASE_URL;
    await pool.query("UPDATE protocols SET start_date='2020-01-01',end_date='2099-12-31' WHERE id=7001");
    await pool.query(`UPDATE clinical_document_reissue_settings SET enabled=TRUE,fee_collection_enabled=FALSE,
      require_human_review=FALSE WHERE empresa_id=5 AND location_id=10`);
    await pool.query("UPDATE telegram_documento_reenvios SET status='cancelado' WHERE status IN ('ofertando','oferecido','enviando')");
  };
  const confirmarPeloCliente = async (inbox: number) => {
    const resposta = await responderSobreDocumentoTelegram(h.db, entrada("sim", inbox));
    expect(resposta).toMatchObject({ tipo: "resposta", documento: { acao: "confirmar_reenvio" } });
    if (resposta?.tipo !== "resposta") throw new Error("sem resposta");
    const plano: PlanoAtendimento = {
      pausa: null, alerta: null, resposta: resposta.texto, orientacaoId: null,
      desfecho: resposta.desfecho, caminhoResolucao: "documento", documento: resposta.documento,
    };
    const e = entrada("sim", inbox);
    expect(await autorizarConfirmacaoReenvio(h.db, e, plano)).toBe(true);
    await pool.query(`INSERT INTO telegram_atendimento_respostas(inbox_message_id,estado,dono,etapas)
      VALUES($1,'processando','owner-rev','{"resposta":{"estado":"enviando"}}')`, [inbox]);
    return enviarLinkReceitaConfirmada("C1", e, plano, "owner-rev");
  };

  it("revisão humana com taxa: pede o consentimento ao cliente, cobra só depois do sim e entrega só depois do pagamento", async () => {
    await limpar(true, true);
    try {
      const { createReissueRequest } = await import("../lib/clinical-document-reissue-policy");
      const { resolveReissueReview } = await import("../lib/clinical-document-reissue-review");
      const { deliverApprovedClinicalDocumentReissue } = await import("../lib/atendimento-telegram-reenvio");
      const criado = await createReissueRequest({ ...baseRequest, operationKey: "00000000-0000-4000-8000-000000000201" });
      expect(criado).toMatchObject({ status: "awaiting_review", eligibility: "human_review" });
      expect(criado.documentHash).toBeTruthy();

      const resolvido = await resolveReissueReview({
        requestId: Number(criado.id), actorProfessionalId: 42, resolution: "fee_required",
        reason: "Tratamento encerrado conferido no prontuário.",
      });
      expect(resolvido).toEqual({ ok: true, status: "awaiting_confirmation", feeAmount: 15 });
      expect(h.enviados.at(-1)?.texto).toContain("R$ 15,00");
      expect(h.asaasChargeCount).toBe(0);
      expect((await deliverApprovedClinicalDocumentReissue(criado.id)).sent).toBe(false);
      const segunda = await resolveReissueReview({
        requestId: Number(criado.id), actorProfessionalId: 42, resolution: "free_treatment",
        reason: "Tentativa repetida de resolver.",
      });
      expect(segunda).toMatchObject({ ok: false, httpStatus: 409 });

      const envio = await confirmarPeloCliente(9101);
      expect(envio.sent).toBe(true);
      expect(h.asaasChargeCount).toBe(1);
      expect(h.enviados.at(-1)?.texto).toContain("Pagar taxa");
      expect(h.enviados.some((m) => m.texto.includes("Abrir documento"))).toBe(false);
      const antes = await pool.query("SELECT request_status,payment_status FROM clinical_document_reissue_requests WHERE id=$1", [criado.id]);
      expect(antes.rows[0]).toMatchObject({ request_status: "awaiting_payment", payment_status: "pending" });

      // Mesmo efeito do webhook conferido no Asaas: a conferência humana já foi feita e não se repete.
      await pool.query(`UPDATE clinical_document_reissue_requests SET payment_status='paid',paid_at=NOW(),
        request_status=CASE WHEN require_human_review AND review_resolved_at IS NULL THEN 'awaiting_review' ELSE 'approved' END
        WHERE id=$1`, [criado.id]);
      await pool.query("UPDATE clinical_document_reissue_requests SET delivery_share_token_hash=NULL WHERE delivery_share_token_hash IS NOT NULL");
      const depois = await pool.query("SELECT request_status FROM clinical_document_reissue_requests WHERE id=$1", [criado.id]);
      expect(depois.rows[0].request_status).toBe("approved");
      expect((await deliverApprovedClinicalDocumentReissue(criado.id)).sent).toBe(true);
      expect(h.enviados.filter((m) => m.texto.includes("Abrir documento"))).toHaveLength(1);
    } finally {
      await restaurar();
    }
  });

  it("revisão humana gratuita: depois do sim do cliente entrega direto, sem nova revisão", async () => {
    await limpar(false, true);
    try {
      const { createReissueRequest } = await import("../lib/clinical-document-reissue-policy");
      const { resolveReissueReview } = await import("../lib/clinical-document-reissue-review");
      await pool.query("UPDATE clinical_document_reissue_requests SET delivery_share_token_hash=NULL WHERE delivery_share_token_hash IS NOT NULL");
      const criado = await createReissueRequest({ ...baseRequest, operationKey: "00000000-0000-4000-8000-000000000202" });
      const resolvido = await resolveReissueReview({
        requestId: Number(criado.id), actorProfessionalId: 42, resolution: "free_treatment",
        reason: "Vigência do tratamento confirmada com a equipe.",
      });
      expect(resolvido).toEqual({ ok: true, status: "awaiting_confirmation", feeAmount: null });
      expect(h.enviados.at(-1)?.texto).toContain("sem cobrança");
      const envio = await confirmarPeloCliente(9102);
      expect(envio.sent).toBe(true);
      expect(h.asaasChargeCount).toBe(0);
      expect(h.enviados.filter((m) => m.texto.includes("Abrir documento"))).toHaveLength(1);
      const final = await pool.query("SELECT request_status,payment_status FROM clinical_document_reissue_requests WHERE id=$1", [criado.id]);
      expect(final.rows[0]).toMatchObject({ request_status: "provider_accepted", payment_status: "not_required" });
    } finally {
      await restaurar();
    }
  });

  it("reenvio manual passa pela política: vigente sai sem cobrança, o resto vira conferência e não envia", async () => {
    await limpar(false, true);
    const { gateStaffResend, finishStaffResend } = await import("../lib/clinical-document-reissue-review");
    const entradaGate = (operationKey: string) => ({
      clientId: 1, empresaId: 5, locationId: 10, documentType: "prescricao" as const, documentId: 6001,
      channels: ["EMAIL"], professionalId: 42, operationKey,
    });
    try {
      const bloqueado = await gateStaffResend(entradaGate("00000000-0000-4000-8000-000000000203"));
      expect(bloqueado.mode).toBe("blocked");
      if (bloqueado.mode === "blocked") {
        const r = await pool.query("SELECT request_status,eligibility_status,requested_by_channel FROM clinical_document_reissue_requests WHERE id=$1", [bloqueado.requestId]);
        expect(r.rows[0]).toEqual({ request_status: "awaiting_review", eligibility_status: "human_review", requested_by_channel: "staff" });
      }
      await pool.query("UPDATE protocols SET start_date='2020-01-01',end_date='2099-12-31' WHERE id=7001");
      const livre = await gateStaffResend(entradaGate("00000000-0000-4000-8000-000000000204"));
      expect(livre).toMatchObject({ mode: "allowed", replay: false });
      if (livre.mode === "allowed") {
        await finishStaffResend(livre.requestId, ["provider_accepted"]);
        const r = await pool.query("SELECT request_status,delivery_status FROM clinical_document_reissue_requests WHERE id=$1", [livre.requestId]);
        expect(r.rows[0]).toEqual({ request_status: "provider_accepted", delivery_status: "provider_accepted" });
      }
      expect(await gateStaffResend(entradaGate("00000000-0000-4000-8000-000000000204"))).toMatchObject({ mode: "allowed", replay: true });
      await pool.query("UPDATE clinical_document_reissue_settings SET enabled=FALSE WHERE empresa_id=5 AND location_id=10");
      expect(await gateStaffResend(entradaGate("00000000-0000-4000-8000-000000000205"))).toEqual({ mode: "legacy" });
    } finally {
      await restaurar();
    }
  });

  it("escopo de emissão é gravado na emissão, não muda com a transferência do cliente e documento antigo não herda a unidade atual", async () => {
    await pool.query("CREATE TABLE IF NOT EXISTS referrals(id serial primary key,client_id integer,status text,emitted_at timestamptz)");
    const { ensureClinicalDocumentReissuesTable } = await import("../lib/ensure-clinical-document-reissues");
    await ensureClinicalDocumentReissuesTable();
    try {
      const emitido = await pool.query("INSERT INTO referrals(client_id,status,emitted_at) VALUES(1,'emitted',NOW()) RETURNING id");
      const id = emitido.rows[0].id;
      let escopo = await pool.query("SELECT issued_empresa_id,issued_location_id FROM referrals WHERE id=$1", [id]);
      expect(escopo.rows[0]).toEqual({ issued_empresa_id: 5, issued_location_id: 10 });
      await pool.query("UPDATE clients SET location_id=11 WHERE id=1");
      await pool.query("UPDATE referrals SET emitted_at=NOW() WHERE id=$1", [id]);
      await pool.query("UPDATE referrals SET issued_location_id=11 WHERE id=$1", [id]);
      escopo = await pool.query("SELECT issued_location_id FROM referrals WHERE id=$1", [id]);
      expect(escopo.rows[0].issued_location_id).toBe(10);

      await pool.query("ALTER TABLE referrals DISABLE TRIGGER trg_stamp_issue_scope");
      const antigo = await pool.query("INSERT INTO referrals(client_id,status,emitted_at) VALUES(1,'emitted',NOW()) RETURNING id");
      await pool.query("ALTER TABLE referrals ENABLE TRIGGER trg_stamp_issue_scope");
      await pool.query("UPDATE referrals SET emitted_at=NOW() WHERE id=$1", [antigo.rows[0].id]);
      const legado = await pool.query("SELECT issued_empresa_id,issued_location_id FROM referrals WHERE id=$1", [antigo.rows[0].id]);
      expect(legado.rows[0]).toEqual({ issued_empresa_id: null, issued_location_id: null });
    } finally {
      await pool.query("UPDATE clients SET location_id=10 WHERE id=1");
      await pool.query("DROP TABLE IF EXISTS referrals");
    }
  });
});

describe("consumidor real do atendimento com banco descartável e somente transporte simulado",()=>{
  const entrada=async(id:number,texto:string,cid=1,empresaId=5)=>{
    h.settings={
      "atendimento.ia.modo":"ligado",
      "telegram.active":"true",
      "telegram.botToken":"synthetic-telegram-token",
    };h.enviados.length=0;h.noEnvio=null;
    await devolverParaIA(h.db,cid,null);
    await pool.query(`INSERT INTO telegram_inbox_messages(id,empresa_id,cliente_id,chat_id,texto,direcao,ambiente_credito)
      VALUES($1,$2,$3,$4,$5,'entrada','teste')`,[id,empresaId,cid,`C${cid}`,texto]);
    const e={...base,inboxMessageId:id,texto,clienteId:cid,empresaId,chatId:`C${cid}`};
    await atenderMensagemTelegram(e);return e;
  };
  it("clínica sem crédito: mensagem preservada, nenhuma resposta; após recarga de teste a resposta sai e é cobrada",async()=>{
    const c=await import("../lib/mensageria-credito");
    await c.definirTarifa({empresaId:null,tipo:"recebida",valorCentavos:10,ativo:true,por:"teste"});
    await c.definirTarifa({empresaId:null,tipo:"enviada",valorCentavos:20,ativo:true,por:"teste"});
    await c.definirTarifa({empresaId:null,tipo:"solucionada",valorCentavos:50,ativo:true,por:"teste"});
    await entrada(301,"quantas horas de jejum para o exame de sangue?",3,7);
    await processarAtendimentosPendentes();await processarAtendimentosPendentes();
    expect(h.enviados.filter(x=>x.chat==="C3")).toHaveLength(0); // sem saldo: nada sai
    const preserv=await pool.query(`SELECT 1 FROM telegram_inbox_messages WHERE id=301`);
    expect(preserv.rows).toHaveLength(1); // a mensagem do cliente continua para a equipe
    expect((await pool.query(`SELECT COUNT(*)::int n FROM msg_extrato WHERE empresa_id=7`)).rows[0].n).toBe(0);
    const r=await c.solicitarRecarga(7,200,"teste","teste");
    await c.confirmarRecarga(r.id,"teste");
    await processarAtendimentosPendentes();await processarAtendimentosPendentes();
    expect(h.enviados.filter(x=>x.chat==="C3")).toHaveLength(1); // retomada: responde uma vez
    const tipos=(await pool.query(`SELECT tipo_evento FROM msg_extrato WHERE empresa_id=7 AND natureza='consumo' ORDER BY id`)).rows.map(x=>x.tipo_evento);
    expect(tipos).toEqual(["recebida","enviada","solucionada"]);
    expect(Number((await pool.query(`SELECT saldo_centavos s FROM msg_carteira WHERE empresa_id=7`)).rows[0].s)).toBe(200-80);
    // Instituto (empresa 5) continua isento e sem débito.
    expect(Number((await pool.query(`SELECT saldo_centavos s FROM msg_carteira WHERE empresa_id=5`)).rows[0].s)).toBe(0);
  });
  it("enfileira sem enviar; mesmo consumidor existente planeja, aprova e registra uma resposta",async()=>{
    await entrada(201,"quantas horas de jejum para o exame de sangue?");
    expect(h.enviados).toHaveLength(0);
    await processarAtendimentosPendentes();await processarAtendimentosPendentes();
    expect(h.enviados).toEqual([{chat:"C1",texto:"APROVADA: jejum de 8 horas."}]);
    const r=await pool.query("SELECT estado,orientacao_id FROM telegram_atendimento_respostas WHERE inbox_message_id=201");
    expect(r.rows[0]).toEqual({estado:"concluido",orientacao_id:"1"});
  });
  it("profissional assume após o alerta: não é sobrescrito e não há resposta automática",async()=>{
    await entrada(202,"dúvida sem orientação correspondente");
    h.noEnvio=async chat=>{if(chat==="ALERTA")await pausarParaHumano(h.db,1,"profissional_assumiu",6);};
    await processarAtendimentosPendentes();h.noEnvio=null;
    expect(h.enviados.map(e=>e.chat)).toEqual(["ALERTA"]);
    expect((await pool.query("SELECT ultimo_erro FROM telegram_atendimento_respostas WHERE inbox_message_id=202")).rows[0].ultimo_erro).toBe("resposta_nao_autorizada");
    expect((await pool.query("SELECT alterado_por FROM telegram_atendimento WHERE cliente_id=1")).rows[0].alterado_por).toBe(6);
  });
  it("aprovação retirada depois do plano impede o envio do texto antigo",async()=>{
    await entrada(203,"quantas horas de jejum para o exame de sangue?");
    const plano={pausa:null,alerta:null,resposta:"APROVADA: jejum de 8 horas.",orientacaoId:1,desfecho:"orientacao_enviada"};
    await pool.query("UPDATE telegram_atendimento_respostas SET plano=$1 WHERE inbox_message_id=203",[plano]);
    await pool.query("UPDATE orientacoes_aprovadas SET status='rascunho' WHERE id=1");
    await processarAtendimentosPendentes();expect(h.enviados).toHaveLength(0);
    expect((await pool.query("SELECT ultimo_erro FROM telegram_atendimento_respostas WHERE inbox_message_id=203")).rows[0].ultimo_erro).toBe("resposta_nao_autorizada");
    await pool.query("UPDATE orientacoes_aprovadas SET status='aprovada' WHERE id=1");
  });
  it("origem de clínica diferente não pausa nem envia",async()=>{
    await entrada(204,"dúvida sintética",3,5);
    await processarAtendimentosPendentes();expect(h.enviados).toHaveLength(0);
    expect((await pool.query("SELECT ultimo_erro FROM telegram_atendimento_respostas WHERE inbox_message_id=204")).rows[0].ultimo_erro).toBe("vinculo_origem_alterado");
    expect((await pool.query("SELECT modo FROM telegram_atendimento WHERE cliente_id=3")).rows[0].modo).toBe("ia");
  });
  it.each(["desvinculado","duplicado","dono_antigo","legitimo"])("pausa atômica: %s no instante do efeito",async(caso)=>{
    const id=205+["desvinculado","duplicado","dono_antigo","legitimo"].indexOf(caso);
    const e=await entrada(id,"teste sintético da pausa");
    await pool.query("UPDATE telegram_atendimento_respostas SET estado='processando',dono='dono-sintetico' WHERE inbox_message_id=$1",[id]);
    try{
      if(caso==="desvinculado")await pool.query("UPDATE clients SET telegram_chat_id=NULL WHERE id=1");
      if(caso==="duplicado")await pool.query("UPDATE clients SET telegram_chat_id='C1' WHERE id=3");
      await pausarAtendimentoDuravel(e,"teste_sintetico",caso==="dono_antigo"?"dono-expirado":"dono-sintetico");
      expect((await pool.query("SELECT modo FROM telegram_atendimento WHERE cliente_id=1")).rows[0].modo)
        .toBe(caso==="legitimo"?"humano":"ia");
      expect(h.enviados).toHaveLength(0);
    }finally{
      await pool.query("UPDATE clients SET telegram_chat_id='C1' WHERE id=1");
      await pool.query("UPDATE clients SET telegram_chat_id='C3' WHERE id=3");
      await pool.query("UPDATE telegram_atendimento_respostas SET estado='esgotado' WHERE inbox_message_id=$1",[id]);
    }
  });
});
