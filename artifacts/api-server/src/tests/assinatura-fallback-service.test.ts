import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({
  database: null as any, criar: vi.fn(), upload: vi.fn(), whatsapp: vi.fn(),
}));
vi.mock("@workspace/db", async () => ({
  ...await import("@workspace/db/schema"),
  db: new Proxy({}, { get(_target, key) {
    const value = state.database?.[key];
    return typeof value === "function" ? value.bind(state.database) : value;
  } }),
}));
vi.mock("../lib/secure-settings", () => ({ getSecret: vi.fn(async () => null) }));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: state.whatsapp }));
vi.mock("../lib/telegram", () => ({ sendTelegram: vi.fn() }));
vi.mock("../lib/google-gmail", () => ({ sendGmailMessage: vi.fn() }));
vi.mock("../lib/google-drive", () => ({ uploadFileToDrive: vi.fn() }));
vi.mock("../lib/assinatura/adapters", () => ({
  getAdapter: () => ({ isConfigured: () => true, createDocumentEnvelope: state.criar }),
}));
vi.mock("../lib/assinatura/htmlParaPdf", () => ({ htmlParaPdfBase64: vi.fn(async () => Buffer.from("pdf-original").toString("base64")) }));
vi.mock("../lib/assinatura/objectStorage", () => ({ uploadPdfAssinado: state.upload, readPdfAssinado: vi.fn() }));
import {
  assinaturaSolicitacoesTable, assinaturaSignatariosTable, assinaturaNotificacoesTable,
  assinaturaTogglesAdminTable, clientsTable,
} from "@workspace/db";
import { enviarAssinatura, processarNotificacoes } from "../lib/assinatura/service";
let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const q = (text: string, values?: unknown[]) => isolated.pool.query(text, values);
beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  // Estrutura sintética derivada dos tipos, nunca conecta ao banco configurado da aplicação.
  for (const table of [assinaturaSolicitacoesTable, assinaturaSignatariosTable, assinaturaNotificacoesTable, assinaturaTogglesAdminTable, clientsTable]) {
    const cfg = getTableConfig(table);
    const cols = cfg.columns.map(c => `"${c.name}" ${c.name === "id" ? "serial PRIMARY KEY" : c.getSQLType()}`);
    await q(`CREATE TABLE "${cfg.name}" (${cols.join(",")})`);
  }
  await q(`CREATE UNIQUE INDEX external_unico ON assinatura_solicitacoes(zapsign_external_id);
    CREATE UNIQUE INDEX notif_unica ON assinatura_notificacoes(solicitacao_id,canal,momento);`);
}, 60_000);
afterAll(async () => { if (isolated) await isolated.stop(); }, 60_000);
beforeEach(async () => {
  await q("TRUNCATE assinatura_solicitacoes, assinatura_signatarios, assinatura_notificacoes, assinatura_toggles_admin, clients RESTART IDENTITY");
  await q("INSERT INTO clients(name,phone,email) VALUES('Cliente Sintético','5500000000000','cliente@example.invalid')");
  state.criar.mockReset().mockRejectedValue(new Error("ZapSign create failed 402: plano inativo"));
  state.upload.mockReset().mockResolvedValue({ storageKey: "assinaturas/original-1.pdf" });
  state.whatsapp.mockReset().mockResolvedValue({ sent: true });
});
describe("fallback 402 e processador real de notificações", () => {
  it("preserva PDF e idempotência sem enfileirar links fictícios", async () => {
    const input = {
      pacienteId: 1, conteudoHtml: "<p>Original</p>", externalId: "original-sintetico",
      metadataExtra: { mock: false, reenvioEstado: "RECIBO", reenvioRecibo: { envelopeId: "falso" } },
    };
    const r = await enviarAssinatura(input);
    expect(r.mock).toBe(true);
    expect(r.links).toEqual([]);
    expect(state.upload).toHaveBeenCalledWith("original-1", Buffer.from("pdf-original"));
    const [row] = (await q("SELECT * FROM assinatura_solicitacoes")).rows;
    expect(row.status).toBe("ENVIADO");
    expect(row.metadata).toEqual({ mock: true, fallback: true, originalPdfKey: "assinaturas/original-1.pdf" });
    expect((await q("SELECT * FROM assinatura_notificacoes")).rows).toHaveLength(0);
    expect((await enviarAssinatura(input)).solicitacaoId).toBe(r.solicitacaoId);
    expect(state.criar).toHaveBeenCalledTimes(1);
  });
  it("erro não 402 não é rotulado como fallback", async () => {
    state.criar.mockRejectedValue(new Error("ZapSign create failed 403: negado"));
    await expect(enviarAssinatura({ pacienteId: 1, conteudoHtml: "<p>Original</p>" })).rejects.toThrow("403");
    expect(state.upload).not.toHaveBeenCalled();
    expect((await q("SELECT * FROM assinatura_notificacoes")).rows).toHaveLength(0);
  });
  it("falha de storage após 402 libera reserva e permite repetir com o mesmo external_id", async () => {
    const input = { pacienteId: 1, conteudoHtml: "<p>Original</p>", externalId: "storage-indisponivel" };
    state.upload.mockRejectedValueOnce(new Error("storage indisponível"));
    await expect(enviarAssinatura(input)).rejects.toThrow("storage indisponível");
    expect((await q("SELECT * FROM assinatura_solicitacoes")).rows).toHaveLength(0);
    expect((await q("SELECT * FROM assinatura_notificacoes")).rows).toHaveLength(0);
    const retry = await enviarAssinatura(input);
    expect(retry.status).toBe("ENVIADO");
    expect(retry.mock).toBe(true);
    expect(state.criar).toHaveBeenCalledTimes(2);
    expect((await q("SELECT metadata FROM assinatura_solicitacoes")).rows[0].metadata.fallback).toBe(true);
  });
  it("fila dispara somente a solicitação e momento pedidos, sem duplicar em concorrência", async () => {
    await q(`INSERT INTO assinatura_notificacoes(solicitacao_id,canal,momento,destinatario,corpo,status)
      VALUES(1,'WHATSAPP','REENVIO_REAL','5500000000000','documento sintético','PENDENTE'),
      (2,'WHATSAPP','ENVIO_INICIAL','5500000000000','não enviar','PENDENTE')`);
    await Promise.all([processarNotificacoes(50, 1, "REENVIO_REAL"), processarNotificacoes(50, 1, "REENVIO_REAL")]);
    expect(state.whatsapp).toHaveBeenCalledTimes(1);
    expect((await q("SELECT status FROM assinatura_notificacoes WHERE solicitacao_id=1")).rows[0].status).toBe("ENVIADO");
    expect((await q("SELECT status FROM assinatura_notificacoes WHERE solicitacao_id=2")).rows[0].status).toBe("PENDENTE");
  });
  it("falha da notificação fica registrada, sem informar entrega", async () => {
    state.whatsapp.mockResolvedValue({ sent: false, error: "recusa-sintetica" });
    await q(`INSERT INTO assinatura_notificacoes(solicitacao_id,canal,momento,destinatario,corpo,status)
      VALUES(1,'WHATSAPP','REENVIO_REAL','5500000000000','documento sintético','PENDENTE')`);
    expect((await processarNotificacoes(50, 1, "REENVIO_REAL")).falhas).toBe(1);
    expect((await q("SELECT status,erro FROM assinatura_notificacoes")).rows[0]).toEqual({ status: "FALHA", erro: "recusa-sintetica" });
  });
});
