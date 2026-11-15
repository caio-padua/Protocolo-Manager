/**
 * Grupo VIP + Conexao Milionaria em PostgreSQL descartavel (instancia propria, sem rede, dados sinteticos).
 * Prova: convite e adesao voluntaria, independencia da categoria, isolamento entre clinicas e entre clientes,
 * boloes com regras, entrada e limite de cotas (inclusive concorrente), jogos conforme a regra, jogo nunca "efetivado"
 * sem comprovante, cobranca Asaas somente leitura, natureza do comprovante e automacao CAIXA declarada pendente.
 * Nenhum Asaas, CAIXA, Google, mensagem ou pagamento e chamado.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const auth = vi.hoisted(() => ({ pid: 7 as number | null, empresaId: 1, autenticado: true, gestores: new Set<string>(["7:1", "8:2"]) }));
vi.mock("../lib/clinical-access", () => ({
  isPlatformOwner: vi.fn(async () => false),
  isGestorDaEmpresa: vi.fn(async (pid: number, emp: number) => auth.gestores.has(`${pid}:${emp}`)),
}));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) => {
    if (auth.pid === null) return res.status(401).json({ error: "login" });
    req.collaborator = { professionalId: auth.pid };
    next();
  },
}));
const mem = vi.hoisted(() => ({ files: new Map<string, Buffer>() }));
vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    async savePrivateObject(k: string, b: Buffer) { mem.files.set(k, b); return k; }
    async readPrivateObject(k: string) { const b = mem.files.get(k); if (!b) throw new Error("ausente"); return b; }
    async deletePrivateObject(k: string) { mem.files.delete(k); }
  },
}));
vi.mock("../lib/boloes-leitura", () => ({ lerComprovanteIA: async () => { throw new Error("nao configurado"); } }));

const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
process.env.SESSION_SECRET = "x".repeat(32);
let app: express.Express; let pool: any; let tok: (id: number) => string;
const H = (id: number) => ({ Authorization: `Bearer ${tok(id)}` });
const G = "/api/boloes/gestao";
const P = "/api/area-paciente/grupo-vip";
const como = (pid: number, empresaId: number) => { auth.pid = pid; auth.empresaId = empresaId; auth.autenticado = true; };
const pdf = (n: string) => Buffer.from(`%PDF-1.4\n% recibo sintetico ${n}\n%%EOF\n`);
const count = async (q: string) => Number((await pool.query(q)).rows[0].n);

// clientes: 1 Maria(A) 2 Joao(A) 3 Ana(B) 4 Pedro(A, nunca convidado)
beforeAll(async () => {
  const db = await import("@workspace/db");
  pool = db.pool;
  await pool.query(`CREATE TABLE empresas (id serial primary key, nome text)`);
  await pool.query(`INSERT INTO empresas (nome) VALUES ('Clinica A'),('Clinica B')`);
  await pool.query(`CREATE TABLE clients (id serial primary key, name text, empresa_id int, deleted_at timestamptz, nivel_cliente text)`);
  await pool.query(`CREATE TABLE app_settings (key text primary key, value text, updated_at timestamptz default now())`);
  await pool.query(`INSERT INTO clients (name, empresa_id, nivel_cliente) VALUES ('Maria Sintetica',1,'prata'),('Joao Sintetico',1,'diamond'),('Ana Sintetica',2,'ouro'),('Pedro Sintetico',1,NULL)`);
  // Livro financeiro do Asaas (so a forma que o codigo le). Tres cobrancas: clinica A, clinica B e sem clinica.
  await pool.query(`CREATE TABLE asaas_cobranca_financeiro (charge_id text primary key, empresa_id int, status_asaas text, bruto_centavos int, data_pagamento date, extrato_recebido_centavos int)`);
  await pool.query(`INSERT INTO asaas_cobranca_financeiro VALUES ('pay_A_1',1,'PENDING',5000,NULL,NULL),('pay_A_2',1,'RECEIVED',5000,'2026-11-10',5000),('pay_B_1',2,'RECEIVED',5000,'2026-11-10',5000),('pay_SEM',NULL,'RECEIVED',5000,'2026-11-10',5000)`);
  const base = await import("../lib/boloes");
  await base.ensureBoloesTables();
  await base.ensureBoloesTables(); // idempotente
  tok = (await import("../lib/portal-token")).createPortalToken;
  app = express(); app.use(express.json());
  app.use((req: any, _r, n) => {
    req.log = { error() {}, warn() {}, info() {} };
    req.tenantContext = { empresaId: auth.empresaId, isPlatformOwner: false, perfilPlataforma: "admin", authenticated: auth.autenticado, professionalId: auth.pid };
    n();
  });
  app.use("/api", (await import("../routes/boloes")).default);
  app.use("/api", (await import("../routes/boloes-gestao")).default);
  app.use("/api", (await import("../routes/grupo-vip-portal")).default);
}, 90_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });

let bolaoClinica = 0; let bolaoPart = 0; let bolaoB = 0;

describe("grupo VIP: convite e adesao voluntaria", () => {
  it("gestor exige login e papel; portal exige token; nenhum cliente entra sem convite", async () => {
    auth.pid = null;
    expect((await request(app).post(`${G}/grupo-vip/convites`).send({ clientId: 1 })).status).toBe(401);
    como(99, 1);
    expect((await request(app).post(`${G}/grupo-vip/convites`).send({ clientId: 1 })).status).toBe(403);
    expect((await request(app).get(P)).status).toBe(401);
    expect((await request(app).get(P).set("Authorization", "Bearer invalido")).status).toBe(401);
    como(7, 1);
    const sem = await request(app).get(P).set(H(4));
    expect(sem.status).toBe(200);
    expect(sem.body.status).toBeNull();
    expect(sem.body.boloes).toEqual([]);
    expect((await request(app).post(`${P}/aceitar`).set(H(4))).status).toBe(404); // sem convite
  });

  it("convite so vale na propria clinica; reconvite duplicado e recusado", async () => {
    como(7, 1);
    expect((await request(app).post(`${G}/grupo-vip/convites`).send({ clientId: 3 })).status).toBe(404); // cliente da clinica B
    expect((await request(app).post(`${G}/grupo-vip/convites`).send({ clientId: 1 })).status).toBe(201);
    expect((await request(app).post(`${G}/grupo-vip/convites`).send({ clientId: 1 })).status).toBe(409);
    expect((await request(app).post(`${G}/grupo-vip/convites`).send({ clientId: 2 })).status).toBe(201);
    como(8, 2);
    expect((await request(app).post(`${G}/grupo-vip/convites`).send({ clientId: 3 })).status).toBe(201);
    const lista = await request(app).get(`${G}/grupo-vip`);
    expect(lista.body.membros.map((m: any) => m.cliente.nome)).toEqual(["Ana Sintetica"]); // a clinica B nao ve a clinica A
  });

  it("adesao e voluntaria: so o proprio cliente aceita, recusa e sai; aceite nao mexe na categoria", async () => {
    const antes = (await pool.query(`SELECT id, nivel_cliente FROM clients ORDER BY id`)).rows;
    expect((await request(app).post(`${P}/aceitar`).set(H(1))).body.status).toBe("ativo");
    expect((await request(app).post(`${P}/aceitar`).set(H(1))).status).toBe(409); // ja ativo
    expect((await request(app).post(`${P}/recusar`).set(H(2))).body.status).toBe("recusou");
    expect((await request(app).post(`${P}/aceitar`).set(H(2))).status).toBe(409); // recusou: so novo convite reabre
    expect((await request(app).get(P).set(H(1))).body.status).toBe("ativo");
    expect((await request(app).get(P).set(H(2))).body.status).toBe("recusou");
    expect((await pool.query(`SELECT id, nivel_cliente FROM clients ORDER BY id`)).rows).toEqual(antes); // categoria intacta
    como(7, 1);
    expect((await request(app).post(`${G}/grupo-vip/convites`).send({ clientId: 2 })).status).toBe(201); // reconvite apos recusa
    expect((await request(app).post(`${P}/aceitar`).set(H(2))).body.status).toBe("ativo");
    const aud = await pool.query(`SELECT acao FROM boloes_auditoria WHERE acao LIKE 'grupo_vip_%' ORDER BY id`);
    expect(aud.rows.map((a: any) => a.acao)).toEqual(expect.arrayContaining(["grupo_vip_convite", "grupo_vip_aceitar", "grupo_vip_recusar"]));
  });
});

describe("boloes: criar, abrir, convidar e entrar", () => {
  it("cria bolao como rascunho com regras; nao abre sem dezenas; transicoes validas", async () => {
    como(7, 1);
    expect((await request(app).post(`${G}/campanhas`).send({ nome: "X", dezenasPorJogo: 10, universoMax: 6 })).status).toBe(400); // dezenas > universo
    const a = await request(app).post(`${G}/campanhas`).send({ nome: "Bolao sintetico clinica define", concurso: "9001", dataSorteio: "2026-12-31", escolhaJogos: "clinica", dezenasPorJogo: 6, universoMax: 60, jogosPorCota: 2, cotasTotal: 3, valorCotaCentavos: 1500 });
    expect(a.status).toBe(201); bolaoClinica = a.body.id;
    const p = await request(app).post(`${G}/campanhas`).send({ nome: "Bolao sintetico participante escolhe", escolhaJogos: "participante", dezenasPorJogo: 6, universoMax: 60, jogosPorCota: 1 });
    bolaoPart = p.body.id;
    const sem = await request(app).post(`${G}/campanhas`).send({ nome: "Sem regra de dezenas" });
    expect((await request(app).post(`${G}/campanhas/${sem.body.id}/status`).send({ status: "aberto" })).status).toBe(400);
    expect((await request(app).get(`${P}`).set(H(1))).body.boloes).toEqual([]); // rascunho nao aparece
    expect((await request(app).post(`${G}/campanhas/${bolaoClinica}/status`).send({ status: "aberto" })).status).toBe(200);
    expect((await request(app).post(`${G}/campanhas/${bolaoPart}/status`).send({ status: "aberto" })).status).toBe(200);
    expect((await request(app).post(`${G}/campanhas/${bolaoPart}/status`).send({ status: "aberto" })).status).toBe(409); // ja aberto
    como(8, 2);
    const b = await request(app).post(`${G}/campanhas`).send({ nome: "Bolao clinica B", dezenasPorJogo: 6 });
    bolaoB = b.body.id;
    expect((await request(app).post(`${G}/campanhas/${bolaoB}/status`).send({ status: "aberto" })).status).toBe(200);
    expect((await request(app).post(`${G}/campanhas/${bolaoClinica}/status`).send({ status: "encerrado" })).status).toBe(404); // outra clinica
  });

  it("cliente ativo ve so boloes abertos da propria clinica; nao-membro ve nada", async () => {
    const v = await request(app).get(P).set(H(1));
    expect(v.body.boloes.map((b: any) => b.nome).sort()).toEqual(["Bolao sintetico clinica define", "Bolao sintetico participante escolhe"]);
    expect(v.body.boloes.find((b: any) => b.id === bolaoClinica).cotasRestantes).toBe(3);
    expect((await request(app).get(P).set(H(4))).body.boloes).toEqual([]);
    expect((await request(app).get(P).set(H(3))).body.boloes.map((b: any) => b.id)).toEqual([]); // convidada, ainda nao aceitou
  });

  it("convite de bolao so para membro ativo; aceite acontece ao entrar; recusa fica registrada", async () => {
    como(7, 1);
    expect((await request(app).post(`${G}/campanhas/${bolaoClinica}/convites`).send({ clientId: 4 })).status).toBe(409); // nao membro
    expect((await request(app).post(`${G}/campanhas/${bolaoB}/convites`).send({ clientId: 1 })).status).toBe(404); // bolao de outra clinica
    expect((await request(app).post(`${G}/campanhas/${bolaoClinica}/convites`).send({ clientId: 1 })).status).toBe(201);
    expect((await request(app).post(`${G}/campanhas/${bolaoClinica}/convites`).send({ clientId: 1 })).status).toBe(409);
    expect((await request(app).post(`${G}/campanhas/${bolaoPart}/convites`).send({ clientId: 2 })).status).toBe(201);
    expect((await request(app).post(`${P}/boloes/${bolaoPart}/recusar`).set(H(2))).status).toBe(200);
    expect((await request(app).post(`${P}/boloes/${bolaoPart}/recusar`).set(H(2))).status).toBe(404);
    const conv = (await request(app).get(`${G}/grupo-vip`)).body.convitesBolao;
    expect(conv.find((c: any) => c.cliente.id === 2).status).toBe("recusado");
    expect((await request(app).get(P).set(H(1))).body.boloes.find((b: any) => b.id === bolaoClinica).convite).toBe("convidado");
  });

  it("entrar: nao-membro 403, bolao de outra clinica 404, duplicado 409, limite de cotas e atomico", async () => {
    expect((await request(app).post(`${P}/boloes/${bolaoClinica}/entrar`).set(H(4)).send({ cotas: 1 })).status).toBe(403);
    expect((await request(app).post(`${P}/boloes/${bolaoB}/entrar`).set(H(1)).send({ cotas: 1 })).status).toBe(404);
    expect((await request(app).post(`${P}/boloes/${bolaoClinica}/entrar`).set(H(1)).send({ cotas: 0 })).status).toBe(400);
    const e1 = await request(app).post(`${P}/boloes/${bolaoClinica}/entrar`).set(H(1)).send({ cotas: 2 });
    expect(e1.status).toBe(201);
    expect((await request(app).post(`${P}/boloes/${bolaoClinica}/entrar`).set(H(1)).send({ cotas: 1 })).status).toBe(409);
    expect((await request(app).get(P).set(H(1))).body.boloes.find((b: any) => b.id === bolaoClinica).convite).toBe("aceito");
    // restam 1 cota: duas entradas simultaneas de 1 cota cada, so uma passa (Joao entra; Maria ja participa)
    const estouro = await request(app).post(`${P}/boloes/${bolaoClinica}/entrar`).set(H(2)).send({ cotas: 2 });
    expect(estouro.status).toBe(409);
    expect(estouro.body.error).toMatch(/cotas/);
    const [a, b] = await Promise.all([
      request(app).post(`${P}/boloes/${bolaoClinica}/entrar`).set(H(2)).send({ cotas: 1 }),
      request(app).post(`${P}/boloes/${bolaoClinica}/entrar`).set(H(2)).send({ cotas: 1 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await count(`SELECT COUNT(*) n FROM boloes_participacoes WHERE campanha_id = ${bolaoClinica}`)).toBe(2);
    expect(await count(`SELECT COALESCE(SUM(cotas),0) n FROM boloes_participacoes WHERE campanha_id = ${bolaoClinica}`)).toBeLessThanOrEqual(3);
  });
});

describe("jogos conforme a regra do bolao", () => {
  const jogo = (...d: number[]) => d;
  it("bolao da clinica: so o gestor define; participante e barrado", async () => {
    const mia = (await request(app).get(P).set(H(1))).body.participacoes.find((p: any) => p.campanha.nome.includes("clinica define"));
    expect(mia.situacaoJogos).toBe("sem_jogos");
    expect(mia.regras.esperado).toBe(4); // 2 cotas x 2 jogos por cota
    expect((await request(app).put(`${P}/participacoes/${mia.id}/jogos`).set(H(1)).send({ jogos: [jogo(1, 2, 3, 4, 5, 6)] })).status).toBe(409);
    como(7, 1);
    const ruins = [
      { jogos: [jogo(1, 2, 3, 4, 5, 6)] },                                                                             // quantidade
      { jogos: [jogo(1, 2, 3, 4, 5, 6), jogo(7, 8, 9, 10, 11, 12), jogo(1, 2, 3, 4, 5, 7), jogo(1, 2, 3, 4, 5, 61)] },  // fora do universo
      { jogos: [jogo(1, 2, 3, 4, 5, 6), jogo(7, 8, 9, 10, 11, 12), jogo(1, 2, 3, 4, 5, 7), jogo(1, 1, 3, 4, 5, 8)] },   // dezena repetida
      { jogos: [jogo(1, 2, 3, 4, 5, 6), jogo(6, 5, 4, 3, 2, 1), jogo(1, 2, 3, 4, 5, 7), jogo(1, 2, 3, 4, 5, 8)] },      // jogo repetido
      { jogos: [jogo(1, 2, 3, 4, 5), jogo(7, 8, 9, 10, 11, 12), jogo(1, 2, 3, 4, 5, 7), jogo(1, 2, 3, 4, 5, 8)] },      // dezenas faltando
    ];
    for (const r of ruins) expect((await request(app).put(`${G}/participacoes/${mia.id}/jogos`).send(r)).status).toBe(422);
    const ok = await request(app).put(`${G}/participacoes/${mia.id}/jogos`).send({ jogos: [jogo(6, 5, 4, 3, 2, 1), jogo(7, 8, 9, 10, 11, 12), jogo(1, 2, 3, 4, 5, 7), jogo(1, 2, 3, 4, 5, 8)] });
    expect(ok.status).toBe(200);
    const v = (await request(app).get(P).set(H(1))).body.participacoes.find((p: any) => p.id === mia.id);
    expect(v.jogos).toHaveLength(4);
    expect(v.jogos[0].dezenas).toEqual([1, 2, 3, 4, 5, 6]); // ordenadas
    expect(v.situacaoJogos).toBe("escolhido_sem_comprovante");
    expect(v.status).toBe("pendente_registro");
    expect(v.comprovante).toBeNull();
  });

  it("bolao do participante: so o dono escolhe; outro cliente e gestor nao", async () => {
    expect((await request(app).post(`${P}/boloes/${bolaoPart}/entrar`).set(H(1)).send({ cotas: 1 })).status).toBe(201);
    const mia = (await request(app).get(P).set(H(1))).body.participacoes.find((p: any) => p.campanha.nome.includes("participante escolhe"));
    const jogos = [jogo(10, 20, 30, 40, 50, 60)];
    expect((await request(app).put(`${P}/participacoes/${mia.id}/jogos`).set(H(2)).send({ jogos })).status).toBe(404); // outra pessoa
    como(7, 1);
    expect((await request(app).put(`${G}/participacoes/${mia.id}/jogos`).send({ jogos })).status).toBe(409); // gestor nao escolhe aqui
    expect((await request(app).put(`${P}/participacoes/${mia.id}/jogos`).send({ jogos })).status).toBe(401); // sem token
    expect((await request(app).put(`${P}/participacoes/${mia.id}/jogos`).set(H(1)).send({ jogos })).status).toBe(200);
    expect((await request(app).put(`${P}/participacoes/${mia.id}/jogos`).set(H(1)).send({ jogos: [jogo(11, 22, 33, 44, 55, 59)] })).status).toBe(200); // pode trocar antes do comprovante
    expect(await count(`SELECT COUNT(*) n FROM boloes_jogos WHERE participacao_id = ${mia.id}`)).toBe(1);
  });

  it("jogo so e efetivado com comprovante oficial; depois dele, os jogos travam; natureza e distinta", async () => {
    como(7, 1);
    const mia = (await request(app).get(P).set(H(1))).body.participacoes.find((p: any) => p.campanha.nome.includes("participante escolhe"));
    // anexar comprovante direto na participacao (recibo real conferido pela clinica)
    const anex = await request(app).post(`${G}/participacoes/${mia.id}/comprovante`).field("confirmoReciboCaixaReal", "true").attach("file", pdf("vip-1"), "r.pdf");
    expect(anex.status).toBe(201);
    const compId = anex.body.id;
    let v = (await request(app).get(P).set(H(1))).body.participacoes.find((p: any) => p.id === mia.id);
    expect(v.situacaoJogos).toBe("efetivado_com_comprovante");
    expect(v.natureza).toBeNull(); // nao classificado: nao assume nominativo nem cota individual
    expect((await request(app).put(`${P}/participacoes/${mia.id}/jogos`).set(H(1)).send({ jogos: [jogo(1, 2, 3, 4, 5, 6)] })).status).toBe(409);
    expect((await request(app).post(`${G}/comprovantes/${compId}/natureza`).send({ natureza: "inventada" })).status).toBe(400);
    expect((await request(app).post(`${G}/comprovantes/${compId}/natureza`).send({ natureza: "nominativo" })).status).toBe(200);
    v = (await request(app).get(P).set(H(1))).body.participacoes.find((p: any) => p.id === mia.id);
    expect(v.natureza).toBe("nominativo");
    expect((await request(app).post(`${G}/comprovantes/${compId}/natureza`).send({ natureza: "cota_oficial_individual" })).status).toBe(200);
    como(8, 2);
    expect((await request(app).post(`${G}/comprovantes/${compId}/natureza`).send({ natureza: "nominativo" })).status).toBe(404); // outra clinica
    // revogar volta o jogo ao estado "escolhido, sem comprovante"
    como(7, 1);
    expect((await request(app).post(`${G}/comprovantes/${compId}/revogar`).send({ motivo: "teste de revogacao" })).status).toBe(200);
    v = (await request(app).get(P).set(H(1))).body.participacoes.find((p: any) => p.id === mia.id);
    expect(v.situacaoJogos).toBe("escolhido_sem_comprovante");
  });
});

describe("cobranca Asaas (somente leitura) e automacao CAIXA", () => {
  it("vincula so cobranca existente no livro da PROPRIA clinica e le o estado; nunca cria cobranca", async () => {
    como(7, 1);
    const lista = (await request(app).get(`${G}/participacoes`)).body.participacoes;
    const mariaId = lista.find((p: any) => p.cliente.nome === "Maria Sintetica" && p.campanha.nome.includes("clinica define")).id;
    const joaoId = lista.find((p: any) => p.cliente.nome === "Joao Sintetico" && p.campanha.nome.includes("clinica define")).id;
    expect(lista.find((p: any) => p.id === mariaId).cobranca.estado).toBe("sem_cobranca");
    expect((await request(app).post(`${G}/participacoes/${mariaId}/cobranca`).send({ chargeId: "pay_B_1" })).status).toBe(404);   // outra clinica
    expect((await request(app).post(`${G}/participacoes/${mariaId}/cobranca`).send({ chargeId: "pay_SEM" })).status).toBe(404);   // sem clinica no livro
    expect((await request(app).post(`${G}/participacoes/${mariaId}/cobranca`).send({ chargeId: "inexistente_1" })).status).toBe(404);
    expect((await request(app).post(`${G}/participacoes/${mariaId}/cobranca`).send({ chargeId: "x; DROP" })).status).toBe(400);
    expect((await request(app).post(`${G}/participacoes/${mariaId}/cobranca`).send({ chargeId: "pay_A_1" })).status).toBe(200);
    expect((await request(app).post(`${G}/participacoes/${joaoId}/cobranca`).send({ chargeId: "pay_A_1" })).status).toBe(409);       // em uso
    let m = (await request(app).get(`${G}/participacoes`)).body.participacoes.find((p: any) => p.id === mariaId);
    expect(m.cobranca.estado).toBe("aguardando");
    // o pagamento "confirmado" so aparece quando o livro (conciliacao) diz RECEIVED; o marcador manual e outra coisa
    expect(m.pagamento).toBe("nao_informado");
    await pool.query(`UPDATE asaas_cobranca_financeiro SET status_asaas='RECEIVED', data_pagamento='2026-11-12', extrato_recebido_centavos=5000 WHERE charge_id='pay_A_1'`);
    m = (await request(app).get(`${G}/participacoes`)).body.participacoes.find((p: any) => p.id === mariaId);
    expect(m.cobranca).toMatchObject({ estado: "confirmado", statusAsaas: "RECEIVED", extratoConferido: true, brutoCentavos: 5000 });
    expect(m.pagamento).toBe("nao_informado");
    const cliente = (await request(app).get(P).set(H(1))).body.participacoes.find((p: any) => p.id === mariaId);
    expect(cliente.cobranca.estado).toBe("confirmado");
    expect(await count(`SELECT COUNT(*) n FROM asaas_cobranca_financeiro`)).toBe(4); // nada foi criado
    como(8, 2);
    expect((await request(app).get(`${G}/participacoes`)).body.participacoes).toEqual([]); // clinica B nao ve a A
  });

  it("automacao CAIXA e declarada pendente e nao registra jogos nem coleta comprovantes", async () => {
    como(7, 1);
    const r = await request(app).get(`${G}/automacao`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: "pendente", registraJogos: false, coletaComprovantes: false });
    auth.pid = null;
    expect((await request(app).get(`${G}/automacao`)).status).toBe(401);
  });

  it("isolamento do cliente: cada um ve so as proprias participacoes", async () => {
    const maria = (await request(app).get(P).set(H(1))).body.participacoes;
    const joao = (await request(app).get(P).set(H(2))).body.participacoes;
    expect(maria.length).toBe(2);
    expect(joao.length).toBe(1);
    expect(new Set([...maria, ...joao].map((p: any) => p.id)).size).toBe(3);
    expect((await request(app).get(P).set(H(3))).body.participacoes).toEqual([]);
  });
});
