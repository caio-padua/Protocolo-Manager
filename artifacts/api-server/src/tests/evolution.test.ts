/** Evolution API: regras puras + rotas (webhook autenticado, isolamento, envio só conectado). Sem rede real. */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({
  real: globalThis.fetch, query: vi.fn(), secrets: {} as Record<string, string>, settings: {} as Record<string, string>,
  fetch: vi.fn(), dbExecute: vi.fn(async (_query?: unknown): Promise<{ rows: unknown[] }> => ({ rows: [] })),
  plan: vi.fn(async (_deps: any, _entrada: any) => ({ resposta: "Resposta aprovada pelo motor.", desfecho: "orientacao_enviada", caminhoResolucao: "regra", orientacaoId: 71, alerta: null, pausa: null })),
  clientMode: vi.fn(async () => "ia" as "ia" | "humano"),
  tenant: { authenticated: true, empresaId: 5, isPlatformOwner: true } as any,
}));
vi.stubGlobal("fetch", h.fetch);
vi.mock("@workspace/db", () => ({ pool: { query: h.query }, db: { execute: h.dbExecute } }));
vi.mock("../lib/secure-settings", () => ({
  getSecret: vi.fn(async (k: string) => h.secrets[k] ?? null),
  setSecret: vi.fn(async (k: string, v: string) => { h.secrets[k] = v; }),
  getSecretStatus: vi.fn(async (k: string) => ({ isSet: Boolean(h.secrets[k]) })),
  getSetting: vi.fn(async (k: string) => h.settings[k] ?? null),
  setSetting: vi.fn(async (k: string, v: string) => { h.settings[k] = v; }),
}));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../lib/atendimento-telegram-store", () => ({ depsReaisAtendimento: () => ({
  alertarEquipe: vi.fn(async () => true),
  lerConfig: vi.fn(async () => ({ modo: "ligado", permitidos: new Set(), queixaRevisada: true })),
  modoDoCliente: h.clientMode,
}) }));
vi.mock("../lib/atendimento-telegram", () => ({ planejarAtendimento: h.plan }));
vi.mock("node:dns/promises", () => ({ default: { lookup: vi.fn(async () => [{ address: "203.0.113.10" }]) } }));
vi.mock("../routes/collaborator", () => ({ requireCollaborator: (_q: any, _r: any, n: () => void) => n() }));

import router, { evolutionWebhookRouter } from "../routes/evolution";
import * as ev from "../lib/evolution";
import { mapaPadrao } from "../lib/telegram-frases";

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
  h.settings = {};
  h.dbExecute.mockImplementation(async () => ({ rows: [{ id: 11, location_id: 10 }] }) as any);
  h.plan.mockClear();
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
  it("motor real só processa e responde quando ativado; reentrega não duplica", async () => {
    let inboundInsertions = 0;
    h.query.mockImplementation(async (sql: string, p: any[] = []) => {
      if (sql.includes("FROM evolution_instancias")) return p[0] === 5 ? CFG : { rows: [] };
      if (sql.includes("SELECT motor_ativo")) return { rows: [{ motor_ativo: true }] };
      if (sql.includes("INSERT INTO evolution_mensagens") && sql.includes("'entrada'")) {
        inboundInsertions++;
        return { rows: inboundInsertions === 1 ? [{ id: 55 }] : [] };
      }
      if (sql.includes("LEFT JOIN evolution_vinculos_cliente")) return { rows: [{ id: 11, name: "Carlúcia" }] };
      if (sql.includes("INSERT INTO evolution_mensagens") && sql.includes("'saida'")) return { rows: [{ id: 56 }] };
      return { rows: [] };
    });
    h.fetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ instance: { state: "open" } }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ key: { id: "MOTOR1" } }) });
    await wh("/evolution/webhook/5/tok5", upsert());
    await wh("/evolution/webhook/5/tok5", upsert());
    expect(h.plan).toHaveBeenCalledOnce();
    const input = h.plan.mock.calls[0]?.[1] as any;
    expect(input.canal).toBe("whatsapp");
    expect(input.simulacao).toBe(false);
    const send = h.fetch.mock.calls.find((call) => String(call[0]).includes("/message/sendText/"));
    expect(send).toBeTruthy();
    const body = JSON.parse(send![1].body);
    expect(body.text).toBe("Resposta aprovada pelo motor.");
  });
  it("instância de outra clínica é ignorada", async () => {
    await wh("/evolution/webhook/5/tok5", { ...upsert(), instance: "outra" });
    expect(h.query.mock.calls.some((c) => String(c[0]).includes("INSERT INTO evolution_mensagens"))).toBe(false);
  });
  it.each(["modo_humano", "orientacao_revogada", "identidade_ambigua"])("bloqueia saída se %s surgir durante o planejamento", async motivo => {
    banco(sql => {
      if (sql.includes("SELECT motor_ativo")) return { rows: [{ motor_ativo: true }] };
      if (sql.includes("'entrada'")) return { rows: [{ id: 55 }] };
      if (sql.includes("LEFT JOIN evolution_vinculos_cliente")) return { rows: [{ id: 11, name: "Cliente sintético" }] };
      return undefined;
    });
    h.dbExecute.mockImplementation(async (q: any) => {
      const text = new PgDialect().sqlToQuery(q).sql;
      if (text.includes("FROM clients")) return { rows: motivo === "identidade_ambigua"
        ? [{ id: 11, location_id: 10 }, { id: 12, location_id: 10 }] : [{ id: 11, location_id: 10 }] } as any;
      if (text.includes("FROM telegram_atendimento")) return { rows: motivo === "modo_humano"
        ? [{ modo: "humano", motivo: "assumido_pela_equipe", alterado_por: 42 }] : [] } as any;
      if (text.includes("FROM orientacoes_aprovadas")) return { rows: motivo === "orientacao_revogada" ? [] : [{ id: 71 }] } as any;
      return { rows: [] };
    });
    await wh("/evolution/webhook/5/tok5", upsert());
    expect(h.plan).toHaveBeenCalledOnce();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.query.mock.calls.some(c => String(c[0]).includes("autorizacao_revogada"))).toBe(true);
  });
  it("identidade ausente avisa sem ler dados clínicos nem inventar vínculo", async () => {
    banco(sql => {
      if (sql.includes("SELECT motor_ativo")) return { rows: [{ motor_ativo: true }] };
      if (sql.includes("INSERT INTO evolution_mensagens")) return { rows: [{ id: 55 }] };
      return undefined;
    });
    h.dbExecute.mockImplementation(async () => ({ rows: Object.entries(mapaPadrao()).map(([chave, texto]) => ({ chave, texto })) }));
    h.fetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ instance: { state: "open" } }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ key: { id: "AVISO1" } }) });
    await wh("/evolution/webhook/5/tok5", upsert());
    expect(h.plan).not.toHaveBeenCalled();
    expect(h.dbExecute).toHaveBeenCalledTimes(1); // somente frases editáveis, sem prontuário
    const message = JSON.parse(h.fetch.mock.calls[1]![1].body).text;
    expect(message).toContain("Nenhum documento foi enviado");
    expect(message).toContain("A equipe foi avisada");
  });
  it("grupo, fromMe e mídia não são gravados", async () => {
    await wh("/evolution/webhook/5/tok5", upsert({ key: { remoteJid: "1@g.us", fromMe: false, id: "G" } }));
    await wh("/evolution/webhook/5/tok5", upsert({ key: { remoteJid: "5511999990000@s.whatsapp.net", fromMe: true, id: "M" } }));
    await wh("/evolution/webhook/5/tok5", upsert({ message: { imageMessage: {} } }));
    expect(h.query.mock.calls.some((c) => String(c[0]).includes("INSERT INTO evolution_mensagens"))).toBe(false);
  });
  it("atualização de entrega avança o status da mensagem enviada", async () => {
    await wh("/evolution/webhook/5/tok5", { event: "messages.update", instance: "clinica5", data: { keyId: "ABC1", status: "DELIVERY_ACK" } });
    const up = h.query.mock.calls.find((c) => String(c[0]).includes("INSERT INTO evolution_status_recebidos"))!;
    expect(up[1][2]).toBe("entregue");
  });
  it.each([
    ["enviado", "DELIVERY_ACK", "delivered"],
    ["entregue", "READ", "read"],
    ["aceito", "ERROR", "failed"],
  ])("correlaciona %s → %s com a segunda via na mesma clínica", async (status, providerStatus, expected) => {
    banco(sql => sql.includes("SELECT status,reissue_request_id")
      ? { rows: [{ status, reissue_request_id: "901" }] } : undefined);
    const response = await wh("/evolution/webhook/5/tok5", {
      event: "messages.update", instance: "clinica5", data: { keyId: "PDF1", status: providerStatus },
    });
    expect(response.status).toBe(200);
    const changed = h.query.mock.calls.find(c => String(c[0]).includes("WITH desired"))!;
    expect(changed).toBeDefined();
    expect(changed[1][0]).toBe(5);
    expect(changed[1][1]).toBe("PDF1");
    const receipt = h.query.mock.calls.find(c => String(c[0]).includes("INSERT INTO evolution_status_recebidos"))!;
    expect(receipt[1][2]).toBe(expected === "delivered" ? "entregue" : expected === "read" ? "lido" : "falha");
    expect(changed[0]).toContain("id=m.reissue_request_id");
    expect(changed[0]).toContain("clinical_document_reissue_requests.empresa_id=m.empresa_id");
    expect(changed[0]).toContain("WHEN bool_or(status='lido') THEN 'lido'");
    expect(changed[0]).toContain("FROM changed_request");
    expect(changed[0]).toContain("delivery_status<>'delivered' OR m.status='lido'");
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it.each(["DELIVERY_ACK", "ERROR"])("reconcilia %s sem substituir um estado mais avançado", async status => {
    await wh("/evolution/webhook/5/tok5", {
      event: "messages.update", instance: "clinica5", data: { keyId: "PDF1", status },
    });
    const changed = h.query.mock.calls.find(c => String(c[0]).includes("WITH desired"))!;
    expect(changed[0]).toContain("CASE msg.status WHEN 'lido'");
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
    const r = await rota("/evolution/teste", { numero: "11999990000", confirmo: true, texto: "Teste supervisionado." });
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
    const r = await rota("/evolution/teste", { numero: "11999990000", confirmo: true, texto: "Teste supervisionado." });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).status).toBe("aceito");
    const ins = h.query.mock.calls.find((c) => String(c[0]).includes("INSERT INTO evolution_mensagens"))!;
    expect(ins[1][2]).toBe("5511999990000");
    expect(ins[1][4]).toBeNull(); expect(ins[1][5]).toBe("incerto");
    const finalized = h.query.mock.calls.find(c => String(c[0]).includes("SET provider_id=$3"))!;
    expect(finalized[1].slice(2, 4)).toEqual(["PROV1", "aceito"]);
    const enviado = JSON.parse(h.fetch.mock.calls[1]![1].body);
    expect(enviado.number).toBe("5511999990000");
    expect(h.fetch.mock.calls[1]![1].headers.apikey).toBe("chave-secreta-1");
  });
  it("servidor recusa o envio: registra falha", async () => {
    h.fetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ instance: { state: "open" } }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) });
    banco((sql) => sql.includes("INSERT INTO evolution_mensagens") ? { rows: [{ id: 2 }] } : undefined);
    const r = await rota("/evolution/teste", { numero: "11999990000", confirmo: true, texto: "Teste supervisionado." });
    expect(r.status).toBe(502);
    expect(((await r.json()) as any).status).toBe("falha");
  });
  it("resposta perdida após envio fica incerta, sem repetir a chamada", async () => {
    h.fetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ instance: { state: "open" } }) })
      .mockRejectedValueOnce(new Error("network response lost"));
    banco(sql => sql.includes("INSERT INTO evolution_mensagens") ? { rows: [{ id: 9 }] } : undefined);
    const r = await rota("/evolution/teste", { numero: "11999990000", confirmo: true, texto: "Teste supervisionado." });
    expect(r.status).toBe(502);
    expect((await r.json() as any).status).toBe("incerto");
    expect(h.fetch).toHaveBeenCalledTimes(2); // consulta da conexão + um único envio
  });
  it("não-admin não faz teste nem altera configuração", async () => {
    h.tenant = { authenticated: true, empresaId: 5, isPlatformOwner: false, perfilPlataforma: "operador" };
    expect((await rota("/evolution/teste", { numero: "11999990000", confirmo: true, texto: "Teste supervisionado." })).status).toBe(403);
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

describe("parâmetros da homologação", () => {
  it("lê e salva modelos por clínica, sem escrever nas configurações globais", async () => {
    let configuracao = {
      texto_teste: "Olá, {cliente}: {pergunta} → {resposta}",
      motor_ativo: false,
      modelo_selecao: "",
      modelo_interprete: "",
      modelo_conferente: "",
      modelo_aprendiz: "",
      nome_assistente: "",
    };
    h.query.mockImplementation(async (sql: string, p: any[] = []) => {
      if (sql.includes("SELECT texto_teste,motor_ativo,modelo_selecao")) return { rows: [configuracao] };
      if (sql.includes("INSERT INTO evolution_homologacao_config") && sql.includes("modelo_selecao")) {
        configuracao = {
          texto_teste: p[1], motor_ativo: p[2], modelo_selecao: p[3], modelo_interprete: p[4],
          modelo_conferente: p[5], modelo_aprendiz: p[6], nome_assistente: p[7],
        };
      }
      return { rows: [] };
    });
    const url = `${base}/evolution/homologacao/config`;
    const leitura = await real(url);
    expect(leitura.status).toBe(200);
    expect((await leitura.json() as any).modelos.selecao).toBe("");
    const atualizacao = await real(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modelos: { selecao: "modelo-a", interprete: "modelo-b", conferente: "modelo-c", aprendizagem: "modelo-d" },
        textoTeste: "Olá, {cliente}: {pergunta} → {resposta}",
        nomeAssistente: "Assistente da clínica",
        motorAtivo: false,
      }),
    });
    expect(atualizacao.status).toBe(200);
    expect(configuracao).toMatchObject({
      modelo_selecao: "modelo-a",
      modelo_interprete: "modelo-b",
      modelo_aprendiz: "modelo-d",
    });
    expect(h.settings).toEqual({});
  });

  it("resolve os quatro últimos dígitos apenas contra um contato autorizado único", async () => {
    vi.stubEnv("EVOLUTION_CONTATOS_AUTORIZADOS", "+55 11 98888-4321");
    h.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id FROM clients")) return { rows: [{ id: 12 }] };
      if (sql.includes("SELECT cliente_id FROM evolution_vinculos_cliente")) return { rows: [] };
      return { rows: [] };
    });
    try {
      const response = await real(`${base}/evolution/homologacao/vinculo`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clienteId: 12, telefoneFinal: "4321", confirmo: true }),
      });
      expect(response.status).toBe(200);
      const output = await response.json() as { telefoneMascarado: string };
      expect(output.telefoneMascarado.endsWith("4321")).toBe(true);
      expect(JSON.stringify(output)).not.toContain("98888");
      const insert = h.query.mock.calls.find((call) => String(call[0]).includes("INSERT INTO evolution_vinculos_cliente"));
      expect(insert?.[1][2]).toBe("5511988884321");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("homologação: contatos autorizados (falha fechada)", () => {
  it.each(["planejar", "enviar-resposta"])("informa a pausa humana sem alterá-la: %s", async rota => {
    banco(sql => {
      if (sql.includes("SELECT texto_teste")) return { rows: [{ texto_teste: "Teste: {cliente} / {pergunta} / {resposta}" }] };
      if (sql.includes("SELECT c.name, c.phone")) return { rows: [{
        name: "Cliente sintético", phone: "11999990000", telefone_vinculado: null,
      }] };
      return undefined;
    });
    h.clientMode.mockResolvedValueOnce("humano");
    const r = await wh(`/evolution/homologacao/${rota}`, { clienteId: 11, pergunta: "Quero segunda via", confirmo: true });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ desfecho: "pausado_humano" });
    expect(h.plan).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.query.mock.calls.some(c => String(c[0]).includes("UPDATE telegram_atendimento"))).toBe(false);
  });

  it.each(["planejar", "enviar-resposta"])("não personaliza nem envia simulação com identidade ambígua: %s", async rota => {
    banco(sql => {
      if (sql.includes("SELECT texto_teste")) return { rows: [{ texto_teste: "Teste: {cliente} / {pergunta} / {resposta}" }] };
      if (sql.includes("SELECT c.name, c.phone")) return { rows: [{
        name: "Cliente sintético", phone: "11999990000", telefone_vinculado: "5511999990000",
      }] };
      return undefined;
    });
    h.dbExecute.mockResolvedValue({ rows: [{ id: 11, location_id: 10 }, { id: 12, location_id: 10 }] });
    const r = await wh(`/evolution/homologacao/${rota}`, {
      clienteId: 11, pergunta: "Quero minha segunda via", confirmo: true,
    });
    expect(r.status).toBe(409);
    expect(h.plan).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });

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

describe("divisão de texto longo sem perda", () => {
  it("texto curto segue inteiro em uma parte", () => {
    expect(ev.dividirTextoSemPerda("abc")).toEqual(["abc"]);
  });
  it("texto longo é dividido e a junção devolve o original exato", () => {
    const par = "Linha de dose 1 mg 🟩 ".repeat(40) + "\n\n";
    const texto = par.repeat(12).trim();
    const partes = ev.dividirTextoSemPerda(texto);
    expect(partes.length).toBeGreaterThan(1);
    expect(partes.every((x) => x.length <= 4000)).toBe(true);
    expect(partes.join("")).toBe(texto);
  });
  it("sem espaços nem quebras ainda não perde caractere", () => {
    const texto = "x".repeat(9000);
    expect(ev.dividirTextoSemPerda(texto).join("")).toBe(texto);
  });
});

