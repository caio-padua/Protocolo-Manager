import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({
  database: null as any, configured: true, criar: vi.fn(), processar: vi.fn(),
}));
vi.mock("@workspace/db", async () => ({
  ...await import("@workspace/db/schema"),
  db: new Proxy({}, { get(_target, key) {
    const value = state.database?.[key];
    return typeof value === "function" ? value.bind(state.database) : value;
  } }),
}));
vi.mock("../lib/assinatura/service", () => ({
  ensureZapsignTokenLoaded: vi.fn(),
  processarNotificacoes: (...args: unknown[]) => state.processar(...args),
}));
vi.mock("../lib/assinatura/adapters", () => ({
  getAdapter: () => ({ isConfigured: () => state.configured, createDocumentEnvelope: state.criar }),
}));
vi.mock("../lib/assinatura/htmlParaPdf", () => ({ htmlParaPdfBase64: vi.fn(async () => "cGRm") }));
vi.mock("../lib/assinatura/objectStorage", () => ({
  readPdfAssinado: vi.fn(async () => Buffer.from("original-pdf")),
}));
import { reenviarFallbacks, saudeFallback } from "../lib/assinatura/fallback";
import { htmlParaPdfBase64 } from "../lib/assinatura/htmlParaPdf";
import { assinaturaSolicitacoesTable } from "@workspace/db";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const q = (text: string, values?: unknown[]) => isolated.pool.query(text, values);
const HTML = "<p>Cliente Sintético — original</p>";
const HASH = createHash("sha256").update(HTML).digest("hex");
const recibo = { envelopeId: "real-sintetico", linksAssinatura: [
  { email: "cliente@example.invalid", url: "https://sign.example.invalid/cliente" },
  { email: "medico@example.invalid", url: "https://sign.example.invalid/medico" },
], rawProvider: null };

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  await q(`
    CREATE TABLE assinatura_solicitacoes (
      id serial PRIMARY KEY, paciente_id int, template_id int, tipo_doc text NOT NULL DEFAULT 'TERMO', titulo text,
      escopo text, provedor_codigo text NOT NULL DEFAULT 'zapsign', provedor_envelope_id text,
      status text NOT NULL DEFAULT 'RASCUNHO', dados_hidratacao jsonb NOT NULL DEFAULT '{}',
      hash_original text, hash_assinado text, signatarios_snapshot jsonb NOT NULL DEFAULT '[]',
      canais_distribuir text[], pdf_assinado_url text, pdf_storage_key text, drive_file_id text,
      zapsign_external_id text UNIQUE, metadata jsonb NOT NULL DEFAULT '{}', enviado_em timestamptz, concluido_em timestamptz,
      criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now());
    CREATE TABLE assinatura_templates (
      id serial PRIMARY KEY, codigo text, titulo text, tipo_doc text, corpo_html text,
      placeholders jsonb DEFAULT '[]', exige_medico boolean DEFAULT false, exige_clinica boolean DEFAULT false,
      exige_testemunhas boolean DEFAULT false, ativo boolean DEFAULT true,
      criado_em timestamptz DEFAULT now(), atualizado_em timestamptz DEFAULT now());
    CREATE TABLE assinatura_signatarios (
      id serial PRIMARY KEY, solicitacao_id int NOT NULL, papel text, nome text, cpf text,
      email text, telefone text, ordem int, status text, link_assinatura text, assinado_em timestamptz,
      criado_em timestamptz DEFAULT now());
    CREATE TABLE assinatura_notificacoes (
      id serial PRIMARY KEY, solicitacao_id int NOT NULL, canal text NOT NULL, momento text NOT NULL,
      destinatario text NOT NULL, assunto text, corpo text NOT NULL, status text NOT NULL DEFAULT 'PENDENTE',
      erro text, enviado_em timestamptz, criado_em timestamptz NOT NULL DEFAULT now(),
      UNIQUE(solicitacao_id,canal,momento));
    CREATE TABLE clients(id int PRIMARY KEY, telegram_chat_id text);
  `);
}, 60_000);
afterAll(async () => { if (isolated) await isolated.stop(); }, 60_000);
beforeEach(async () => {
  await q("TRUNCATE assinatura_solicitacoes, assinatura_templates, assinatura_signatarios, assinatura_notificacoes, clients RESTART IDENTITY");
  state.criar.mockReset().mockResolvedValue(recibo);
  state.processar.mockReset().mockResolvedValue({ enviadas: 1 });
  state.configured = true;
  vi.mocked(htmlParaPdfBase64).mockClear();
});
async function seed(metadata: Record<string, unknown> = { fallback: true, mock: true }) {
  await q("INSERT INTO clients VALUES(1,'chat-sintetico') ON CONFLICT DO NOTHING");
  const tpl = await q("INSERT INTO assinatura_templates(codigo,corpo_html) VALUES('CGLO','<p>{{TEXTO}}</p>') RETURNING id");
  const snapshot = [
    { papel: "PACIENTE", nome: "Cliente Sintético", email: "cliente@example.invalid", telefone: "5500000000000", ordem: 1 },
    { papel: "MEDICO", nome: "Médico Sintético", email: "medico@example.invalid", ordem: 2, authMode: "qualificada" },
  ];
  const row = await q(`INSERT INTO assinatura_solicitacoes(paciente_id,template_id,status,provedor_envelope_id,
    zapsign_external_id,metadata,dados_hidratacao,hash_original,signatarios_snapshot,canais_distribuir)
    VALUES(1,$1,'ENVIADO','MOCK-OLD',$2,$3,$4,$5,$6,ARRAY['EMAIL','WHATSAPP','TELEGRAM']) RETURNING id`,
  [tpl.rows[0].id, `external-${tpl.rows[0].id}`, metadata, { TEXTO: "Cliente Sintético — original" }, HASH, JSON.stringify(snapshot)]);
  return row.rows[0].id as number;
}
const sol = async (id: number) => (await q("SELECT * FROM assinatura_solicitacoes WHERE id=$1", [id])).rows[0];

describe("reenvio real — Postgres isolado e provedor simulado", () => {
  it("preserva solicitação e external_id; atualiza links, flags e dispara fila", async () => {
    const id = await seed();
    await q("INSERT INTO assinatura_notificacoes(solicitacao_id,canal,momento,destinatario,corpo) VALUES($1,'EMAIL','ENVIO_INICIAL','x','mock')", [id]);
    const r = await reenviarFallbacks();
    expect(r.reenviados).toBe(1);
    expect(await saudeFallback()).toEqual({ aguardandoReenvioReal: 0, bloqueados: 0 });
    expect((await sol(id)).metadata).toMatchObject({ fallback: false, mock: false, reenvioEstado: "CONCLUIDO" });
    expect((await sol(id)).provedor_envelope_id).toBe("real-sintetico");
    expect(state.criar).toHaveBeenCalledWith(expect.objectContaining({
      externalId: "external-1", enviarWhatsappAutomatico: false, enviarEmailAutomatico: false,
      signatarios: expect.arrayContaining([expect.objectContaining({ papel: "MEDICO", authMode: "qualificada" })]),
    }));
    const links = (await q("SELECT link_assinatura FROM assinatura_signatarios ORDER BY ordem")).rows;
    expect(links.map((l: any) => l.link_assinatura)).toEqual(recibo.linksAssinatura.map(l => l.url));
    const fila = (await q("SELECT * FROM assinatura_notificacoes WHERE momento='REENVIO_REAL'")).rows;
    expect(fila).toHaveLength(3);
    expect(fila.every((n: any) => n.status === "PENDENTE" && n.corpo.includes("/cliente"))).toBe(true);
    expect(state.processar).toHaveBeenCalledWith(50, id, "REENVIO_REAL");
    await reenviarFallbacks();
    expect(state.criar).toHaveBeenCalledTimes(1);
    expect(state.processar).toHaveBeenCalledTimes(1);
  });
  it("concorrência não cria dois envelopes", async () => {
    await seed();
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    let entrou!: () => void;
    const started = new Promise<void>(r => { entrou = r; });
    state.criar.mockImplementation(async () => { entrou(); await gate; return recibo; });
    const primeiro = reenviarFallbacks();
    await started;
    await reenviarFallbacks();
    release();
    await primeiro;
    expect(state.criar).toHaveBeenCalledTimes(1);
  });
  it("402 mantém pendente sem notificar e permite tentar após ativação", async () => {
    const id = await seed();
    state.criar.mockRejectedValueOnce(new Error("ZapSign create failed 402: plano"));
    expect((await reenviarFallbacks()).falhas).toBe(1);
    expect((await sol(id)).metadata.fallback).toBe(true);
    expect(state.processar).not.toHaveBeenCalled();
    await reenviarFallbacks();
    expect(state.criar).toHaveBeenCalledTimes(2);
    expect((await sol(id)).metadata.fallback).toBe(false);
  });
  it("resposta perdida fica bloqueada inclusive em nova chamada", async () => {
    const id = await seed();
    state.criar.mockRejectedValue(new Error("network timeout"));
    await reenviarFallbacks();
    expect((await sol(id)).metadata.reenvioEstado).toBe("INCERTO");
    expect(await saudeFallback()).toEqual({ aguardandoReenvioReal: 1, bloqueados: 1 });
    await reenviarFallbacks();
    expect(state.criar).toHaveBeenCalledTimes(1);
  });
  it("reserva abandonada não expira nem é retomada", async () => {
    await seed({ fallback: true, mock: true, reenvioEstado: "RESERVADO" });
    await reenviarFallbacks();
    expect(state.criar).not.toHaveBeenCalled();
    expect((await saudeFallback()).bloqueados).toBe(1);
  });
  it("template alterado não envia documento diferente", async () => {
    const id = await seed();
    await q("UPDATE assinatura_templates SET corpo_html='alterado'");
    await reenviarFallbacks();
    expect(state.criar).not.toHaveBeenCalled();
    expect((await sol(id)).metadata.reenvioEstado).toBe("CONTEUDO_DIVERGENTE");
  });
  it("PDF original dispensa template modificado", async () => {
    await seed({ fallback: true, mock: true, originalPdfKey: "assinaturas/original-1.pdf" });
    await q("UPDATE assinatura_templates SET corpo_html='alterado'");
    await reenviarFallbacks();
    expect(htmlParaPdfBase64).not.toHaveBeenCalled();
    expect(state.criar).toHaveBeenCalledWith(expect.objectContaining({ pdfBase64: Buffer.from("original-pdf").toString("base64") }));
  });
  it("recibo persistido recupera links e fila sem recriar envelope", async () => {
    const id = await seed({ fallback: true, mock: true, reenvioEstado: "RECIBO", reenvioRecibo: recibo });
    await reenviarFallbacks();
    expect(state.criar).not.toHaveBeenCalled();
    expect((await sol(id)).metadata.fallback).toBe(false);
  });
  it("falha transacional após aceite preserva recibo e permite concluir sem duplicar", async () => {
    const id = await seed();
    await q("ALTER TABLE assinatura_notificacoes ADD CONSTRAINT falha_teste CHECK (momento <> 'REENVIO_REAL')");
    try {
      await reenviarFallbacks();
      expect((await sol(id)).metadata.reenvioEstado).toBe("RECIBO");
      expect((await sol(id)).provedor_envelope_id).toBe("MOCK-OLD");
    } finally { await q("ALTER TABLE assinatura_notificacoes DROP CONSTRAINT falha_teste"); }
    await reenviarFallbacks();
    expect(state.criar).toHaveBeenCalledTimes(1);
    expect((await sol(id)).metadata.fallback).toBe(false);
  });
  it("seleção antiga anterior ao recibo usa metadados atuais da reserva e não cria segundo envelope", async () => {
    const id = await seed();
    // Executor B selecionou a linha antes de A criar o envelope.
    const selecaoAntiga = await state.database.select().from(assinaturaSolicitacoesTable);
    expect(selecaoAntiga[0].metadata.reenvioRecibo).toBeUndefined();
    await q("ALTER TABLE assinatura_notificacoes ADD CONSTRAINT falha_tardia CHECK (momento <> 'REENVIO_REAL')");
    try {
      // A recebe aceite, persiste recibo e falha na finalização.
      await reenviarFallbacks();
      expect((await sol(id)).metadata.reenvioEstado).toBe("RECIBO");
    } finally { await q("ALTER TABLE assinatura_notificacoes DROP CONSTRAINT falha_tardia"); }
    // B prossegue com seu lote antigo. Somente a seleção do lote é defasada;
    // a reserva, o recibo e a finalização continuam reais no Postgres isolado.
    const select = vi.spyOn(state.database, "select").mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => selecaoAntiga }) }) }),
    }));
    try {
      await reenviarFallbacks();
    } finally { select.mockRestore(); }
    expect(state.criar).toHaveBeenCalledTimes(1);
    expect((await sol(id)).provedor_envelope_id).toBe(recibo.envelopeId);
    expect((await sol(id)).metadata.fallback).toBe(false);
    expect((await q("SELECT * FROM assinatura_signatarios")).rows).toHaveLength(2);
    expect((await q("SELECT * FROM assinatura_notificacoes")).rows).toHaveLength(3);
  });
  it("falha ao guardar recibo após aceite bloqueia repetição", async () => {
    const id = await seed();
    await q(`ALTER TABLE assinatura_solicitacoes ADD CONSTRAINT falha_recibo CHECK (NOT metadata ? 'reenvioRecibo')`);
    try {
      await reenviarFallbacks();
      expect((await sol(id)).metadata.reenvioEstado).toBe("INCERTO");
      await reenviarFallbacks();
      expect(state.criar).toHaveBeenCalledTimes(1);
    } finally { await q("ALTER TABLE assinatura_solicitacoes DROP CONSTRAINT falha_recibo"); }
  });
  it("não inclui concluídos, recusados, mocks sem fallback ou outros provedores", async () => {
    await seed({ mock: true });
    const id = await seed();
    await q("UPDATE assinatura_solicitacoes SET status='CONCLUIDO' WHERE id=$1", [id]);
    const outro = await seed();
    await q("UPDATE assinatura_solicitacoes SET provedor_codigo='clicksign' WHERE id=$1", [outro]);
    await reenviarFallbacks();
    expect(state.criar).not.toHaveBeenCalled();
    expect((await saudeFallback()).aguardandoReenvioReal).toBe(0);
  });
  it("provedor não configurado não altera registros", async () => {
    const id = await seed();
    state.configured = false;
    await expect(reenviarFallbacks()).rejects.toThrow("zapsign_nao_configurado");
    expect((await sol(id)).metadata).toEqual({ fallback: true, mock: true });
  });
});
