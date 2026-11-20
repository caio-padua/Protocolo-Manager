/** Atendimento por IA com SQL real em BANCO DESCARTÁVEL (socket em /tmp; nunca toca DATABASE_URL). Dados sintéticos. */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const h = vi.hoisted(() => ({ db: null as any, enviados: [] as { chat: string; texto: string }[], settings: {} as Record<string, string>,
  noEnvio:null as null|((chat:string)=>Promise<void>), pg: null as any,
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
vi.mock("../lib/telegram-config", () => ({ chatAlertaOuNull: async () => "ALERTA" }));
vi.mock("../lib/ai-central", () => ({ requireAiTenant: () => ({ headers: {} }) }));
vi.mock("../lib/clinical-document-share", () => ({
  getIssuedDocument: async () => ({
    id: 6001,
    clientId: 1,
    professionalId: 42,
    prescriptionId: 5001,
    status: "emitted",
    pdfData: "JVBERi1zeW50aGV0aWM=",
    fileName: "receita.pdf",
    label: "Receituário de demonstração",
    empresaId: 5,
  }),
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
      id integer primary key,empresa_id integer,telegram_chat_id text,
      status text NOT NULL DEFAULT 'active',deleted_at timestamptz
    );
    INSERT INTO clients(id,empresa_id,telegram_chat_id) VALUES(1,5,'C1'),(2,5,'C2'),(3,7,'C3');
    CREATE TABLE prescriptions(id integer primary key,client_id integer,empresa_id integer,status text,emitted_at timestamptz);
    CREATE TABLE prescription_items(id serial primary key,prescription_id integer,name text,dose text,order_index integer DEFAULT 0);
    CREATE TABLE recipes(id integer primary key,title text,prescription_id integer,pdf_data text);
    CREATE TABLE protocols(id integer primary key,client_id integer,empresa_id integer,title text,status text,updated_at timestamptz DEFAULT NOW());
    INSERT INTO prescriptions(id,client_id,empresa_id,status,emitted_at) VALUES(5001,1,5,'emitted',NOW());
    INSERT INTO prescription_items(prescription_id,name,dose,order_index) VALUES
      (5001,'Vitamina X','dose sintética não deve aparecer',0);
    INSERT INTO recipes(id,title,prescription_id,pdf_data)
      VALUES(6001,'Receituário de demonstração',5001,'JVBERi1zeW50aGV0aWM=');
    INSERT INTO protocols(id,client_id,empresa_id,title,status)
      VALUES(7001,1,5,'Protocolo de suporte','active');
    CREATE TABLE telegram_inbox_messages (id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL DEFAULT 0, cliente_id INTEGER NOT NULL,
    chat_id TEXT NOT NULL, texto TEXT NOT NULL, recebida_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), lida_em TIMESTAMPTZ, direcao TEXT NOT NULL DEFAULT 'entrada', update_id BIGINT)`);
  h.db = drizzle(pool);
  h.pg = pool;
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
      documento: { acao: "ofertar_reenvio", receitaId: 6001, prescricaoId: 5001 },
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
      expect(segundaVia).toMatchObject({ tipo: "encaminhar", motivo: "segunda_via_ambigua_ou_ausente" });
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
    const confirmacaoPlano: PlanoAtendimento = {
      ...ofertaPlano,
      resposta: "Confirmado.",
      desfecho: "reenvio_receita_confirmado",
      documento: { acao: "confirmar_reenvio", receitaId: 6001, prescricaoId: 5001, ofertaId: 2 },
    };
    const ofertaReal = await pool.query("SELECT id FROM telegram_documento_reenvios WHERE oferta_inbox_message_id=902");
    confirmacaoPlano.documento!.ofertaId = Number(ofertaReal.rows[0].id);
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
      const tokenSalvo = await pool.query(`SELECT document_share_token_hash,document_share_expires_at
        FROM telegram_atendimento_respostas WHERE inbox_message_id=903`);
      expect(tokenSalvo.rows[0]).toEqual({
        document_share_token_hash: "66d34fba71f8f450f7e45598853e53bfc23bbd129027cbb131a2f4ffd7878cd0",
        document_share_expires_at: expect.any(Date),
      });
    } finally {
      if (baseAnterior === undefined) delete process.env.PUBLIC_BASE_URL;
      else process.env.PUBLIC_BASE_URL = baseAnterior;
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
