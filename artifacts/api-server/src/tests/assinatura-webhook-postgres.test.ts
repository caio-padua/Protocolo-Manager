import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

// Webhook de assinatura contra Postgres descartável. Dados 100% sintéticos
// (Código Paxter, Art. 82): provedor em modo simulado (sem token => sem rede),
// armazenamento do PDF em memória, nenhuma mensagem enviada.
const state = vi.hoisted(() => ({ database: null as any, arquivos: new Map<string, Buffer>() }));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const db = new Proxy({}, {
    get(_t, key) {
      const value = state.database?.[key];
      return typeof value === "function" ? value.bind(state.database) : value;
    },
  });
  return { ...schema, db };
});
vi.mock("../lib/secure-settings", () => ({ getSecret: vi.fn(async () => null) }));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: vi.fn() }));
vi.mock("../lib/telegram", () => ({ sendTelegram: vi.fn() }));
vi.mock("../lib/google-gmail", () => ({ sendGmailMessage: vi.fn() }));
vi.mock("../lib/google-drive", () => ({ uploadFileToDrive: vi.fn(async () => ({ fileId: "x" })) }));
vi.mock("../lib/assinatura/htmlParaPdf", () => ({ htmlParaPdfBase64: vi.fn() }));
vi.mock("../lib/assinatura/objectStorage", () => ({
  uploadPdfAssinado: vi.fn(async (chave: string, pdf: Buffer) => {
    state.arquivos.set(chave, pdf);
    return { storageKey: `sintetico/${chave}.pdf` };
  }),
  readPdfAssinado: vi.fn(),
}));

import { receberWebhook } from "../lib/assinatura/service";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const q = (text: string, values?: unknown[]) => isolated.pool.query(text, values);
const SEGREDO = "segredo-sintetico-de-teste";
const ok = { "x-paxter-secret": SEGREDO };

const enviar = (payload: Record<string, unknown>, headers: Record<string, string> = ok) =>
  receberWebhook("zapsign", Buffer.from(JSON.stringify(payload)), headers);
const evento = async (id: number) =>
  (await q("SELECT processado, erro_processamento, solicitacao_id FROM assinatura_webhook_eventos WHERE id=$1", [id])).rows[0];
const status = async (id: number) =>
  (await q("SELECT status, pdf_storage_key, hash_assinado FROM assinatura_solicitacoes WHERE id=$1", [id])).rows[0];

beforeAll(async () => {
  process.env["ZAPSIGN_WEBHOOK_SECRET"] = SEGREDO;
  delete process.env["ZAPSIGN_API_TOKEN"];
  delete process.env["ZAPSIGN_TOKEN"];
  delete process.env["CEO_WHATSAPP"];
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  await q(`
    CREATE TABLE assinatura_solicitacoes (
      id serial PRIMARY KEY, paciente_id int, template_id int, tipo_doc text NOT NULL DEFAULT 'TERMO', titulo text,
      escopo text, provedor_codigo text NOT NULL DEFAULT 'zapsign', provedor_envelope_id text,
      status text NOT NULL DEFAULT 'RASCUNHO', dados_hidratacao jsonb NOT NULL DEFAULT '{}',
      hash_original text, hash_assinado text, signatarios_snapshot jsonb NOT NULL DEFAULT '[]',
      canais_distribuir text[], pdf_assinado_url text, pdf_storage_key text, drive_file_id text,
      zapsign_external_id text, metadata jsonb NOT NULL DEFAULT '{}', enviado_em timestamptz, concluido_em timestamptz,
      criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now());
    CREATE TABLE assinatura_webhook_eventos (
      id serial PRIMARY KEY, provedor_codigo text NOT NULL, event_id text NOT NULL, event_type text NOT NULL,
      envelope_id text, solicitacao_id int, payload_bruto jsonb NOT NULL DEFAULT '{}', signature_header text,
      signature_valida boolean NOT NULL DEFAULT false, processado boolean NOT NULL DEFAULT false,
      processado_em timestamptz, erro_processamento text, criado_em timestamptz NOT NULL DEFAULT now());
    CREATE UNIQUE INDEX assinatura_webhook_provedor_evento_unico ON assinatura_webhook_eventos(provedor_codigo, event_id);
    CREATE TABLE assinatura_notificacoes (
      id serial PRIMARY KEY, solicitacao_id int NOT NULL, canal text NOT NULL, momento text NOT NULL,
      destinatario text NOT NULL, assunto text, corpo text NOT NULL, status text NOT NULL DEFAULT 'PENDENTE',
      erro text, enviado_em timestamptz, criado_em timestamptz NOT NULL DEFAULT now());
    CREATE TABLE clients (id serial PRIMARY KEY, name text, phone text, email text, drive_folder_id text);
  `);
}, 60_000);
afterAll(async () => { if (isolated) await isolated.stop(); }, 60_000);
beforeEach(async () => {
  await q("TRUNCATE assinatura_solicitacoes, assinatura_webhook_eventos, assinatura_notificacoes RESTART IDENTITY");
  state.arquivos.clear();
});

async function criarSolicitacao(envelope: string, st = "ENVIADO") {
  const r = await q(
    "INSERT INTO assinatura_solicitacoes (tipo_doc, provedor_envelope_id, status) VALUES ('TERMO', $1, $2) RETURNING id",
    [envelope, st],
  );
  return r.rows[0].id as number;
}

describe("webhook de assinatura — estados verificáveis", () => {
  it("assinatura inválida: 401, nada processado, nenhuma solicitação alterada", async () => {
    const sol = await criarSolicitacao("DOC-A");
    const r = await enviar({ token: "DOC-A", event_type: "doc_signed", last_update_at: "t1" }, { "x-paxter-secret": "errado" });
    expect(r.unauthorized).toBe(true);
    expect((await evento(r.eventoId)).processado).toBe(false);
    expect((await status(sol)).status).toBe("ENVIADO");
  });

  it("documento assinado que casa: só vira CONCLUIDO com PDF guardado e hash", async () => {
    const sol = await criarSolicitacao("DOC-B");
    const r = await enviar({ token: "DOC-B", event_type: "doc_signed", last_update_at: "t1" });
    expect(r.ok).toBe(true);
    const s = await status(sol);
    expect(s.status).toBe("CONCLUIDO");
    expect(s.pdf_storage_key).toMatch(/\.pdf$/);
    expect(s.hash_assinado).toMatch(/^[0-9a-f]{64}$/);
    expect(await evento(r.eventoId)).toMatchObject({ processado: true, solicitacao_id: sol });
  });

  it("envelope que não casa com nenhuma solicitação NÃO fica 'processado com sucesso'", async () => {
    const sol = await criarSolicitacao("DOC-C");
    const r = await enviar({ token: "DOC-DESCONHECIDO", event_type: "doc_signed", last_update_at: "t1" });
    expect(r).toMatchObject({ ok: true, semSolicitacao: true });
    expect(await evento(r.eventoId)).toMatchObject({
      processado: false, erro_processamento: "solicitacao_nao_encontrada", solicitacao_id: null,
    });
    expect((await status(sol)).status).toBe("ENVIADO");
  });

  it("evento órfão reentregue continua reprocessável e passa a casar quando a solicitação existir", async () => {
    const payload = { token: "DOC-TARDIO", event_type: "doc_signed", last_update_at: "t1" };
    const primeiro = await enviar(payload);
    expect(primeiro.semSolicitacao).toBe(true);
    const sol = await criarSolicitacao("DOC-TARDIO");
    const segundo = await enviar(payload);
    expect(segundo.eventoId).toBe(primeiro.eventoId);
    expect(segundo.duplicado).toBe(false);
    expect((await status(sol)).status).toBe("CONCLUIDO");
    const ev = await evento(segundo.eventoId);
    expect(ev).toMatchObject({ processado: true, solicitacao_id: sol, erro_processamento: null });
    // terceira entrega agora é duplicado real
    expect((await enviar(payload)).duplicado).toBe(true);
  });

  it("recusa de documento conhecido vira REJEITADO; recusa órfã fica pendente", async () => {
    const sol = await criarSolicitacao("DOC-D");
    const r1 = await enviar({ token: "DOC-D", event_type: "doc_refused", last_update_at: "t1" });
    expect((await status(sol)).status).toBe("REJEITADO");
    expect((await evento(r1.eventoId)).processado).toBe(true);
    const r2 = await enviar({ token: "DOC-OUTRO", event_type: "doc_refused", last_update_at: "t1" });
    expect(r2.semSolicitacao).toBe(true);
    expect((await evento(r2.eventoId)).processado).toBe(false);
  });

  it("evento que não muda estado (ex.: visualização) é arquivado como processado sem alterar nada", async () => {
    const sol = await criarSolicitacao("DOC-E");
    const r = await enviar({ token: "DOC-E", event_type: "doc_viewed", last_update_at: "t1" });
    expect(r.semSolicitacao).toBeUndefined();
    expect((await evento(r.eventoId)).processado).toBe(true);
    expect((await status(sol)).status).toBe("ENVIADO");
  });
});
