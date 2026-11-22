/** Evolution API: regras puras + rotas (webhook autenticado, isolamento, envio só conectado). Sem rede real. */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const h = vi.hoisted(() => ({ real: globalThis.fetch, query: vi.fn(), secrets: {} as Record<string, string>, fetch: vi.fn(), tenant: { authenticated: true, empresaId: 5, isPlatformOwner: true } as any }));
vi.stubGlobal("fetch", h.fetch);
vi.mock("@workspace/db", () => ({ pool: { query: h.query } }));
vi.mock("../lib/secure-settings", () => ({
  getSecret: vi.fn(async (k: string) => h.secrets[k] ?? null),
  setSecret: vi.fn(async (k: string, v: string) => { h.secrets[k] = v; }),
  getSecretStatus: vi.fn(async (k: string) => ({ isSet: Boolean(h.secrets[k]) })),
}));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("node:dns/promises", () => ({ default: { lookup: vi.fn(async () => [{ address: "203.0.113.10" }]) } }));
vi.mock("../routes/collaborator", () => ({ requireCollaborator: (_q: any, _r: any, n: () => void) => n() }));

import router, { evolutionWebhookRouter } from "../routes/evolution";
import * as ev from "../lib/evolution";

process.env.EVOLUTION_HOMOLOGACAO = "false"; // as regras gerais rodam fora da homologação; a lista autorizada é testada abaixo

let server: Server; let base: string;
beforeAll(async () => {
  const app = express(); app.use(express.json());
  app.use((req, _r, n) => { (req as any).tenantContext = h.tenant; n(); });
  app.use("/api", evolutionWebhookRouter); app.use("/api", router);
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => { server.close(); });

const real = h.real;

const CFG = { rows: [{ base_url: "https://evo.exemplo.com", instance_name: "clinica5" }] };
function banco(extra: (sql: string, p: any[]) => any = () => undefined) {
  h.query.mockImplementation(async (sql: string, p: any[] = []) => {
    const x = extra(sql, p); if (x !== undefined) return x;
    if (sql.includes("FROM evolution_instancias")) return p[0] === 5 ? CFG : { rows: [] };
    return { rows: [] };
  });
}
beforeEach(() => {
  vi.clearAllMocks(); ev._zerarLimite();
  h.secrets = { "evolution.apiKey.5": "chave-secreta-1", "evolution.webhookToken.5": "tok5" };
  h.tenant = { authenticated: true, empresaId: 5, isPlatformOwner: true };
  h.fetch.mockReset(); banco();
  // as chamadas locais usam real; o provedor usa h.fetch (mock)
});

describe("regras puras", () => {
  it("https obrigatório e sem credencial na URL", () => {
    expect(() => ev.normalizarBaseUrl("http://x.com", {})).toThrow();
    expect(() => ev.normalizarBaseUrl("https://u:p@x.com")).toThrow();
    expect(ev.normalizarBaseUrl("https://x.com/")).toBe("https://x.com");
  });
  it("bloqueia rede interna", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"]) expect(ev.ipPrivado(ip)).toBe(true);
    expect(ev.ipPrivado("203.0.113.10")).toBe(false);
  });
  it("estado da conexão nunca presume", () => {
    expect(ev.estadoDaResposta({ ok: true, status: 200, json: { instance: { state: "open" } } })).toBe("conectado");
    expect(ev.estadoDaResposta({ ok: true, status: 200, json: { instance: { state: "close" } } })).toBe("desconectado");
    expect(ev.estadoDaResposta({ ok: true, status: 200, json: { foo: 1 } })).toBe("erro_do_provedor");
    expect(ev.estadoDaResposta({ ok: false, status: 401, json: null })).toBe("credenciais_recusadas");
    expect(ev.estadoDaResposta({ ok: false, status: 404, json: null })).toBe("instancia_inexistente");
    expect(ev.estadoDaResposta({ ok: false, status: 0, json: null, falha: "rede" })).toBe("servidor_inacessivel");
  });
  it("status: aceito→enviado→entregue→lido; falha não apaga entrega", () => {
    expect(ev.statusEvolutionPodeAvancar("aceito", "enviado")).toBe(true);
    expect(ev.statusEvolutionPodeAvancar("entregue", "enviado")).toBe(false);
    expect(ev.statusEvolutionPodeAvancar("entregue", "falha")).toBe(false);
    expect(ev.statusEvolutionPodeAvancar("aceito", "falha")).toBe(true);
    expect(ev.statusDoProvedor("DELIVERY_ACK")).toBe("entregue");
    expect(ev.statusDoProvedor("xyz")).toBeNull();
  });
  it("chave da clínica é por empresa", () => { expect(ev.chaveApi(5)).not.toBe(ev.chaveApi(6)); });
  it("token compara sem vazar", () => { expect(ev.tokenConfere("a", "a")).toBe(true); expect(ev.tokenConfere("a", null)).toBe(false); expect(ev.tokenConfere("", "x")).toBe(false); });
  it("limite de envios por minuto", () => { for (let i = 0; i < 10; i++) expect(ev.podeEnviarAgora(5, 10, 60000, 1000)).toBe(true); expect(ev.podeEnviarAgora(5, 10, 60000, 1001)).toBe(false); });
});

const upsert = (over: any = {}) => ({ event: "messages.upsert", instance: "clinica5", data: { key: { remoteJid: "5511999990000@s.whatsapp.net", fromMe: false, id: "ABC1" }, message: { conversation: "oi" }, ...over } });
const wh = (path: string, body: unknown) => real(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("webhook", () => {
  it("token errado: 403 e nada gravado", async () => {
    const r = await wh("/evolution/webhook/5/errado", upsert());
    expect(r.status).toBe(403);
    expect(h.query).not.toHaveBeenCalled();
  });
  it("token da clínica 6 não abre a clínica 5", async () => {
    h.secrets["evolution.webhookToken.6"] = "tok6";
    expect((await wh("/evolution/webhook/5/tok6", upsert())).status).toBe(403);
  });
  it("sem token cadastrado: recusa", async () => {
    expect((await wh("/evolution/webhook/9/qualquer", upsert())).status).toBe(403);
  });
  it("mensagem recebida é gravada na clínica certa e sem resposta automática", async () => {
    const r = await wh("/evolution/webhook/5/tok5", upsert());
    expect(r.status).toBe(200);
    const ins = h.query.mock.calls.find((c) => String(c[0]).includes("INSERT INTO evolution_mensagens"))!;
    expect(ins[1][0]).toBe(5); expect(ins[1][2]).toBe("5511999990000"); expect(ins[1][3]).toBe("oi");
    expect(h.fetch).not.toHaveBeenCalled(); // nada enviado ao provedor
  });
  it("instância de outra clínica é ignorada", async () => {
    await wh("/evolution/webhook/5/tok5", { ...upsert(), instance: "outra" });
    expect(h.query.mock.calls.some((c) => String(c[0]).includes("INSERT INTO evolution_mensagens"))).toBe(false);
  });
  it("grupo, fromMe e mídia não são gravados", async () => {
    await wh("/evolution/webhook/5/tok5", upsert({ key: { remoteJid: "1@g.us", fromMe: false, id: "G" } }));
    await wh("/evolution/webhook/5/tok5", upsert({ key: { remoteJid: "5511999990000@s.whatsapp.net", fromMe: true, id: "M" } }));
    await wh("/evolution/webhook/5/tok5", upsert({ message: { imageMessage: {} } }));
    expect(h.query.mock.calls.some((c) => String(c[0]).includes("INSERT INTO evolution_mensagens"))).toBe(false);
  });
  it("atualização de entrega avança o status da mensagem enviada", async () => {
    banco((sql) => sql.includes("SELECT status FROM evolution_mensagens") ? { rows: [{ status: "enviado" }] } : undefined);
    await wh("/evolution/webhook/5/tok5", { event: "messages.update", instance: "clinica5", data: { keyId: "ABC1", status: "DELIVERY_ACK" } });
    const up = h.query.mock.calls.find((c) => String(c[0]).includes("UPDATE evolution_mensagens"))!;
    expect(up[1][2]).toBe("entregue");
  });
});

describe("envio humano", () => {
  const rota = (p: string, b: unknown) => real(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  // as rotas chamam fetch (mockado) para o provedor; o cliente de teste usa 'real'
  it("teste sem confirmação é recusado", async () => {
    expect((await rota("/evolution/teste", { numero: "11999990000" })).status).toBe(400);
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("teste com celular desconectado: 409, nada enviado, nada fingido", async () => {
    h.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ instance: { state: "close" } }) });
    const r = await rota("/evolution/teste", { numero: "11999990000", confirmo: true });
    expect(r.status).toBe(409);
    expect(((await r.json()) as any).estado).toBe("desconectado");
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.query.mock.calls.some((c) => String(c[0]).includes("INSERT INTO evolution_mensagens"))).toBe(false);
  });
  it("conectado: envio vira 'aceito' (não 'entregue')", async () => {
    h.fetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ instance: { state: "open" } }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ key: { id: "PROV1" }, status: "PENDING" }) });
    banco((sql) => sql.includes("INSERT INTO evolution_mensagens") ? { rows: [{ id: 1 }] } : undefined);
    const r = await rota("/evolution/teste", { numero: "11999990000", confirmo: true });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).status).toBe("aceito");
    const ins = h.query.mock.calls.find((c) => String(c[0]).includes("INSERT INTO evolution_mensagens"))!;
    expect(ins[1][2]).toBe("5511999990000"); expect(ins[1][4]).toBe("PROV1"); expect(ins[1][5]).toBe("aceito");
    const enviado = JSON.parse(h.fetch.mock.calls[1]![1].body);
    expect(enviado.number).toBe("5511999990000");
    expect(h.fetch.mock.calls[1]![1].headers.apikey).toBe("chave-secreta-1");
  });
  it("servidor recusa o envio: registra falha", async () => {
    h.fetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ instance: { state: "open" } }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) });
    banco((sql) => sql.includes("INSERT INTO evolution_mensagens") ? { rows: [{ id: 2 }] } : undefined);
    const r = await rota("/evolution/teste", { numero: "11999990000", confirmo: true });
    expect(r.status).toBe(502);
    expect(((await r.json()) as any).status).toBe("falha");
  });
  it("não-admin não faz teste nem altera configuração", async () => {
    h.tenant = { authenticated: true, empresaId: 5, isPlatformOwner: false, perfilPlataforma: "operador" };
    expect((await rota("/evolution/teste", { numero: "11999990000", confirmo: true })).status).toBe(403);
    expect((await real(`${base}/evolution/config`, { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(403);
  });
  it("responder: só a quem já escreveu", async () => {
    const r = await rota("/evolution/responder", { contato: "5511988887777", texto: "olá" });
    expect(r.status).toBe(403);
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("configuração recusa http e endereço interno; resposta nunca devolve a chave", async () => {
    const put = (b: unknown) => real(`${base}/evolution/config`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    expect((await put({ baseUrl: "http://evo.exemplo.com", instanceName: "a", apiKey: "12345678" })).status).toBe(400);
    expect((await put({ baseUrl: "https://127.0.0.1", instanceName: "a", apiKey: "12345678" })).status).toBe(400);
    const g = await real(`${base}/evolution/config`);
    expect(JSON.stringify(await g.json())).not.toContain("chave-secreta-1");
  });
  it("sem instância configurada para a clínica: estado explícito", async () => {
    h.tenant = { authenticated: true, empresaId: 6, isPlatformOwner: true };
    const r = await real(`${base}/evolution/conexao`);
    expect(((await r.json()) as any).estado).toBe("nao_configurado");
  });
});


describe("homologação: contatos autorizados (falha fechada)", () => {
  it("lista vazia bloqueia todos; só número exato da lista passa", () => {
    expect(ev.contatoAutorizado("5511999990000", { EVOLUTION_CONTATOS_AUTORIZADOS: "" } as any)).toBe(false);
    const env = { EVOLUTION_CONTATOS_AUTORIZADOS: "+55 11 99999-0000, 11988887777" } as any;
    expect(ev.contatoAutorizado("5511999990000", env)).toBe(true);
    expect(ev.contatoAutorizado("5511999990000@s.whatsapp.net", env)).toBe(true);
    expect(ev.contatoAutorizado("5511999990001", env)).toBe(false);
    expect(ev.contatoAutorizado("grupo@g.us", env)).toBe(false);
  });
  it("só libera tudo com EVOLUTION_HOMOLOGACAO=false explícito", () => {
    expect(ev.homologacaoAtiva({} as any)).toBe(true);
    expect(ev.homologacaoAtiva({ EVOLUTION_HOMOLOGACAO: "false" } as any)).toBe(false);
  });
});
