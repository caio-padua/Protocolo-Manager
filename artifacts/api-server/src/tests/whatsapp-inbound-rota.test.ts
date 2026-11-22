/**
 * Rota de entrada do WhatsApp: autenticação, identidade, clínica, resposta automática e
 * ausência de espelho. Tudo com dependências simuladas — nenhuma mensagem real é enviada.
 */
import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const h = vi.hoisted(() => ({
  query: vi.fn(),
  sendWhatsapp: vi.fn(),
  registrar: vi.fn(),
  ai: vi.fn(),
}));

vi.mock("@workspace/db", () => ({ pool: { query: h.query } }));
vi.mock("../lib/secure-settings", () => ({ getSecret: vi.fn(async (k: string) => (k === "twilio.authToken" ? "tok" : null)) }));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: h.sendWhatsapp, registrarLogMensagem: h.registrar }));
vi.mock("../lib/ai-central", () => ({ requireAiTenant: () => ({ headers: {} }) }));
vi.mock("@workspace/integrations-anthropic-ai", () => ({ anthropic: { messages: { create: h.ai } } }));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./collaborator", () => ({ requireCollaborator: (_q: unknown, r: any) => r.status(401).json({}) }));
vi.mock("../routes/collaborator", () => ({ requireCollaborator: (_q: unknown, r: any) => r.status(401).json({}) }));
vi.mock("../middleware/tenantContext.js", () => ({ requirePlatformOwner: (_q: unknown, _r: unknown, n: () => void) => n() }));

import router from "../routes/whatsapp-inbound";
import { assinaturaEsperada } from "../lib/whatsapp-seguranca";

let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use("/api", router);
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });

const FROM = "whatsapp:+5511999990000";
const TO = "whatsapp:+5511911112222";

function enviar(params: Record<string, string>, assinar: boolean | "errada" = true) {
  const url = `${base}/api/whatsapp/inbound`;
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", "x-forwarded-proto": "http" };
  if (assinar === true) headers["x-twilio-signature"] = assinaturaEsperada("tok", url, params);
  if (assinar === "errada") headers["x-twilio-signature"] = "assinatura-falsa";
  return fetch(url, { method: "POST", headers, body: new URLSearchParams(params).toString() });
}

/** Banco simulado: clientes, empresas (canal) e contexto clínico. */
function banco(opts: { clientes?: any[]; empresas?: any[]; protocolo?: any; duplicada?: boolean } = {}) {
  h.query.mockImplementation(async (sql: string) => {
    if (sql.includes("direcao = 'entrada'") && sql.includes("sid = $1")) return { rows: opts.duplicada ? [{ 1: 1 }] : [] };
    if (sql.includes("FROM empresas")) return { rows: opts.empresas ?? [] };
    if (sql.includes("FROM clients c") && sql.includes("protocols")) return { rows: opts.protocolo ? [opts.protocolo] : [] };
    if (sql.includes("FROM clients")) return { rows: opts.clientes ?? [] };
    if (sql.includes("FROM professionals")) return { rows: [] };
    return { rows: [] };
  });
}

const CLIENTE = { id: 7, name: "Cliente Teste", phone: "(11) 99999-0000", empresa_id: 5 };
const CANAL_EMPRESA_5 = [{ id: 5, twilio_numero: "+55 11 91111-2222", wa_numero: null }];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WHATSAPP_INBOUND_AUTORESPOSTA;
  h.sendWhatsapp.mockResolvedValue({ sent: true });
  h.registrar.mockResolvedValue(1);
  h.ai.mockResolvedValue({ content: [{ text: "resposta" }] });
  banco({ clientes: [CLIENTE], empresas: CANAL_EMPRESA_5, protocolo: { ptitle: "Protocolo Secreto", feitas: 2, total: 8 } });
});

describe("autenticação da entrada", () => {
  it("sem assinatura: 403, sem gravar, sem consultar, sem responder", async () => {
    const r = await enviar({ From: FROM, To: TO, Body: "oi", MessageSid: "SM1" }, false);
    expect(r.status).toBe(403);
    expect(h.registrar).not.toHaveBeenCalled();
    expect(h.query).not.toHaveBeenCalled();
    expect(h.sendWhatsapp).not.toHaveBeenCalled();
    expect(h.ai).not.toHaveBeenCalled();
  });
  it("assinatura inválida: 403", async () => {
    const r = await enviar({ From: FROM, To: TO, Body: "oi", MessageSid: "SM1" }, "errada");
    expect(r.status).toBe(403);
    expect(h.registrar).not.toHaveBeenCalled();
    expect(h.sendWhatsapp).not.toHaveBeenCalled();
  });
});

describe("resposta automática desligada (padrão de teste)", () => {
  it("assinatura válida: grava a entrada, não chama IA, não envia nada", async () => {
    const r = await enviar({ From: FROM, To: TO, Body: "oi", MessageSid: "SM2" });
    expect(r.status).toBe(200);
    expect(h.registrar).toHaveBeenCalledTimes(1);
    expect(h.registrar.mock.calls[0]![0]).toMatchObject({ direcao: "entrada", clienteId: 7 });
    expect(h.ai).not.toHaveBeenCalled();
    expect(h.sendWhatsapp).not.toHaveBeenCalled();
  });
  it("reenvio do mesmo MessageSid não grava de novo", async () => {
    banco({ clientes: [CLIENTE], empresas: CANAL_EMPRESA_5, duplicada: true });
    const r = await enviar({ From: FROM, To: TO, Body: "oi", MessageSid: "SM2" });
    expect(r.status).toBe(200);
    expect(h.registrar).not.toHaveBeenCalled();
  });
});

describe("identidade e clínica (resposta automática ligada)", () => {
  beforeEach(() => { process.env.WHATSAPP_INBOUND_AUTORESPOSTA = "true"; });
  const promptEnviado = () => String(h.ai.mock.calls[0]![0].system);

  it("número exato + clínica do canal confirmada: dado clínico entra no contexto", async () => {
    await enviar({ From: FROM, To: TO, Body: "como estou?", MessageSid: "SM3" });
    expect(promptEnviado()).toContain("Protocolo Secreto");
  });
  it("canal sem dono: nenhum dado clínico", async () => {
    banco({ clientes: [CLIENTE], empresas: [], protocolo: { ptitle: "Protocolo Secreto", feitas: 1, total: 2 } });
    await enviar({ From: FROM, To: TO, Body: "como estou?", MessageSid: "SM4" });
    expect(promptEnviado()).not.toContain("Protocolo Secreto");
    expect(promptEnviado()).not.toContain("Cliente Teste");
    expect(promptEnviado()).toContain("NÃO confirmadas");
  });
  it("canal de OUTRA clínica: nenhum dado clínico", async () => {
    banco({ clientes: [CLIENTE], empresas: [{ id: 9, twilio_numero: "+55 11 91111-2222", wa_numero: null }], protocolo: { ptitle: "Protocolo Secreto", feitas: 1, total: 2 } });
    await enviar({ From: FROM, To: TO, Body: "como estou?", MessageSid: "SM5" });
    expect(promptEnviado()).not.toContain("Protocolo Secreto");
  });
  it("mesmo final de telefone, número diferente: não identifica", async () => {
    banco({ clientes: [{ ...CLIENTE, phone: "(21) 99999-0000" }], empresas: CANAL_EMPRESA_5, protocolo: { ptitle: "Protocolo Secreto", feitas: 1, total: 2 } });
    await enviar({ From: FROM, To: TO, Body: "como estou?", MessageSid: "SM6" });
    expect(promptEnviado()).not.toContain("Protocolo Secreto");
    expect(h.registrar.mock.calls[0]![0].clienteId).toBeUndefined();
  });
  it("dois cadastros com o mesmo número: ambíguo, ninguém é identificado", async () => {
    banco({ clientes: [CLIENTE, { ...CLIENTE, id: 8, empresa_id: 6 }], empresas: CANAL_EMPRESA_5, protocolo: { ptitle: "Protocolo Secreto", feitas: 1, total: 2 } });
    await enviar({ From: FROM, To: TO, Body: "como estou?", MessageSid: "SM7" });
    expect(promptEnviado()).not.toContain("Protocolo Secreto");
    expect(h.registrar.mock.calls[0]![0].clienteId).toBeUndefined();
  });
  it("a resposta nunca é espelhada no Telegram", async () => {
    await enviar({ From: FROM, To: TO, Body: "oi", MessageSid: "SM8" });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.sendWhatsapp).toHaveBeenCalledTimes(1);
    expect(h.sendWhatsapp.mock.calls[0]![2]).toMatchObject({ mirrorTelegram: false, contexto: "inbound_reply" });
  });
});

describe("rota de configuração do Twilio", () => {
  it("não é pública: sem colaborador autenticado devolve 401", async () => {
    const r = await fetch(`${base}/api/whatsapp/inbound/setup`);
    expect(r.status).toBe(401);
  });
});
