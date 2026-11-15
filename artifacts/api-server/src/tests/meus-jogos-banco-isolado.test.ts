/**
 * MEUS JOGOS em PostgreSQL descartavel (instancia propria, sem rede, dados sinteticos).
 * Prova: regras e precos oficiais (tabela x formula combinatoria), validacao de dezenas, resultados com fonte simulada
 * (inclusive indisponivel), bloqueio sem robo, maquina de estados, idempotencia/duplicidade/concorrencia, integridade
 * financeira (valor, referencia, titular), prazos, comprovante como unica porta para "efetivado", isolamento entre
 * clientes e clinicas, login. Nenhum Asaas, CAIXA, aposta, pagamento ou mensagem reais.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const auth = vi.hoisted(() => ({ pid: 7 as number | null, empresaId: 1, gestores: new Set<string>(["7:1", "8:2"]) }));
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
let L: typeof import("../lib/meus-jogos");
let R: typeof import("../lib/meus-jogos-regras");
let RES: typeof import("../lib/meus-jogos-resultados");
let ROBO: typeof import("../lib/meus-jogos-robo");
let setJson: (k: string, v: unknown) => Promise<void>;
let calendarioFake: unknown;
const H = (id: number) => ({ Authorization: `Bearer ${tok(id)}` });
const P = "/api/area-paciente/meus-jogos";
const G = "/api/boloes/gestao/meus-jogos";
const como = (pid: number | null, empresaId = 1) => { auth.pid = pid; auth.empresaId = empresaId; };
const q = async (s: string, a: unknown[] = []) => (await pool.query(s, a)).rows;
const n = async (s: string) => Number((await q(s))[0].n);
const pdf = (x: string) => Buffer.from(`%PDF-1.4\n% comprovante sintetico ${x}\n%%EOF\n`);

const dia = (d: number) => { const x = new Date(Date.now() + d * 86_400_000); return new Date(x.getTime() - 3 * 3_600_000).toISOString().slice(0, 10); };
let seq = 0; const chave = () => `k${Date.now().toString(36)}${(++seq).toString().padStart(6, "0")}`;
const DEZ6 = [1, 2, 3, 4, 5, 6];
const jogoMega = (i: number) => [1 + i, 10 + i, 20 + i, 30 + i, 40 + i, 50 + i]; // so para i de 0 a 9
const jogoN = (i: number) => [1, 2, 3, 4, 5, 7 + i]; // distintos para i de 0 a 53

/** Robo simulado: registra o que recebeu, comportamento programavel. Nunca fala com a CAIXA. */
function roboFalso(opts: { disponivel?: boolean; registrar?: "ok" | "erro"; estado?: any } = {}) {
  const chamadas: any[] = [];
  return {
    chamadas,
    estado: async () => ({ disponivel: opts.disponivel ?? true, motivo: "simulado", ambiente: "simulado" as const }),
    registrarJogos: async (p: any) => { chamadas.push(p); if (opts.registrar === "erro") throw new Error("timeout simulado"); return { ref: `sim-${p.chave}` }; },
    consultarEstado: async () => opts.estado ?? { estado: "em_andamento" },
  };
}
/** Asaas simulado. */
let seqCobranca = 0;
function asaasFalso() {
  const st = { cobrancas: new Map<string, any>(), criadas: 0, consultaFalha: false };
  return {
    st,
    criarCobranca: async (i: any) => { st.criadas++; const id = `pay_sim_${++seqCobranca}`; st.cobrancas.set(id, { status: "PENDING", valueReais: i.valueReais, externalReference: i.externalReference, deleted: false }); return { id, invoiceUrl: `https://sandbox.invalid/${id}` }; },
    consultarCobranca: async (id: string) => { if (st.consultaFalha) throw new Error("rede"); return st.cobrancas.get(id); },
  };
}

// clientes: 1 Maria(A, asaas cus_1, membro) 2 Joao(A, membro, sem cadastro Asaas) 3 Ana(B, membro) 4 Pedro(A, nao membro)
beforeAll(async () => {
  const db = await import("@workspace/db");
  pool = db.pool;
  await pool.query(`CREATE TABLE empresas (id serial primary key, nome text)`);
  await pool.query(`INSERT INTO empresas (nome) VALUES ('Clinica A'),('Clinica B')`);
  await pool.query(`CREATE TABLE clients (id serial primary key, name text, empresa_id int, deleted_at timestamptz, nivel_cliente text, asaas_customer_id text)`);
  await pool.query(`CREATE TABLE app_settings (key text primary key, value text, updated_at timestamptz default now())`);
  await pool.query(`CREATE TABLE professionals (id serial primary key, photo_url text, is_primary_doctor boolean, active boolean)`);
  await pool.query(`INSERT INTO professionals (photo_url, is_primary_doctor, active) VALUES ('/private/doctor-photo', true, true)`);
  await pool.query(`INSERT INTO clients (name, empresa_id, nivel_cliente, asaas_customer_id) VALUES ('Maria Sintetica',1,'prata','cus_1'),('Joao Sintetico',1,'diamond',NULL),('Ana Sintetica',2,'ouro','cus_3'),('Pedro Sintetico',1,NULL,NULL)`);
  const base = await import("../lib/boloes");
  await base.ensureBoloesTables();
  L = await import("../lib/meus-jogos");
  await L.ensureMeusJogosTables();
  await L.ensureMeusJogosTables(); // idempotente
  R = await import("../lib/meus-jogos-regras");
  RES = await import("../lib/meus-jogos-resultados");
  ROBO = await import("../lib/meus-jogos-robo");
  setJson = (await import("../lib/secure-settings")).setJsonSetting;
  await pool.query(`INSERT INTO grupo_vip_membros (empresa_id, client_id, status) VALUES (1,1,'ativo'),(1,2,'ativo'),(2,3,'ativo'),(1,4,'convidado')`);
  tok = (await import("../lib/portal-token")).createPortalToken;
  app = express(); app.use(express.json());
  app.use((req: any, _r, nx) => {
    req.log = { error() {}, warn() {}, info() {} };
    req.tenantContext = { empresaId: auth.empresaId, isPlatformOwner: false, perfilPlataforma: "admin", authenticated: auth.pid !== null, professionalId: auth.pid };
    nx();
  });
  app.use("/api", (await import("../routes/meus-jogos-portal")).default);
  app.use("/api", (await import("../routes/meus-jogos-gestao")).default);
  // Ambiente de teste: proximo concurso daqui a 3 dias; fonte conferida agora; fechamento 19:00 informado pela clinica A.
  const agora = new Date().toISOString();
  for (const m of R.MODALIDADES) {
    await setJson(`meus_jogos.proximo.${m}`, { concurso: 5000, data: dia(3), obtidoEm: agora });
    await setJson(`meus_jogos.fonte.${m}`, { modalidade: m, ok: true, verificadoEm: agora, divergencias: [] });
  }
  calendarioFake = {
    geradoEm: agora, validoAte: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    meses: [dia(3).slice(0, 7), dia(6).slice(0, 7)], feriados: [],
    regras: { semanal: true, domingoSabado22h: true, bolao15min: true, umaHoraAntes: true, bolaoSemana1930: true },
    sorteios: R.MODALIDADES.flatMap((modalidade) => [
      { modalidade, concurso: 5000, data: dia(3), especial: false, apostasEncerramEm: null, horaSorteio: "21:00" },
      { modalidade, concurso: 5001, data: dia(6), especial: false, apostasEncerramEm: null, horaSorteio: "21:00" },
    ]),
  };
  await setJson("meus_jogos.calendario.oficial", calendarioFake);
  await setJson("meus_jogos.config.1", { ...L.CONFIG_PADRAO, fechamentoOficial: { megasena: "19:00", lotofacil: "19:00", quina: "19:00", lotomania: "19:00" }, fonteFechamento: "texto de teste" });
}, 90_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });

describe("regras oficiais e precos", () => {
  it("tabela oficial bate com a formula combinatoria (so consistencia, nao fonte)", () => {
    const C = (a: number, b: number) => { let r = 1; for (let i = 1; i <= b; i++) r = (r * (a - b + i)) / i; return Math.round(r); };
    const base = { megasena: [6, 600], lotofacil: [15, 350], quina: [5, 300] } as const;
    for (const [m, [k0, c0]] of Object.entries(base)) {
      const r = R.REGRAS[m as keyof typeof R.REGRAS];
      for (let k = r.dezenasMin; k <= r.dezenasMax; k++) expect(r.precosCentavos[k], `${m} ${k}`).toBe(C(k, k0) * c0);
    }
    expect(R.REGRAS.lotomania.precosCentavos).toEqual({ 50: 300 });
    expect(R.precoOficial("megasena", 6)).toBe(600);
    expect(R.precoOficial("megasena", 5)).toBeNull();
  });

  it("valida dezenas: quantidade, intervalo, repeticao, tipo; ordena e precifica", () => {
    expect(R.validarAposta("megasena", [6, 5, 4, 3, 2, 1])).toEqual({ ok: true, dezenas: DEZ6, precoCentavos: 600 });
    expect(R.validarAposta("megasena", [1, 2, 3, 4, 5])).toEqual({ ok: false, motivo: "quantidade_invalida" });
    expect(R.validarAposta("megasena", [1, 2, 3, 4, 5, 61])).toEqual({ ok: false, motivo: "dezena_invalida" });
    expect(R.validarAposta("megasena", [0, 2, 3, 4, 5, 6])).toEqual({ ok: false, motivo: "dezena_invalida" });
    expect(R.validarAposta("megasena", [1, 1, 3, 4, 5, 6])).toEqual({ ok: false, motivo: "dezena_repetida" });
    expect(R.validarAposta("megasena", [1.5, 2, 3, 4, 5, 6])).toEqual({ ok: false, motivo: "dezena_invalida" });
    expect(R.validarAposta("megasena", "abc")).toEqual({ ok: false, motivo: "quantidade_invalida" });
    expect(R.validarAposta("quina", [1, 2, 3, 4, 80]).ok).toBe(true);
    expect(R.validarAposta("quina", [1, 2, 3, 4, 81]).ok).toBe(false);
    const lm = Array.from({ length: 50 }, (_, i) => i * 2); // 0..98, inclui o zero
    expect(R.validarAposta("lotomania", lm)).toMatchObject({ ok: true, precoCentavos: 300 });
    expect(R.validarAposta("lotomania", [...lm.slice(1), 99])).toMatchObject({ ok: true });
    expect(R.validarAposta("lotomania", lm.slice(1)).ok).toBe(false);
    expect(R.validarAposta("lotofacil", Array.from({ length: 15 }, (_, i) => i + 1))).toMatchObject({ ok: true, precoCentavos: 350 });
  });

  it("fonte desatualizada: snapshot velho ou divergencia bloqueia; conferencia ok renova", () => {
    const hoje = new Date("2026-11-20T12:00:00Z"); const velho = new Date("2027-01-20T12:00:00Z");
    expect(R.situacaoDaFonte("megasena", hoje, null).desatualizado).toBe(false);
    expect(R.situacaoDaFonte("megasena", velho, null).desatualizado).toBe(true);
    expect(R.situacaoDaFonte("megasena", velho, { modalidade: "megasena", ok: true, verificadoEm: velho.toISOString(), divergencias: [] }).desatualizado).toBe(false);
    expect(R.situacaoDaFonte("megasena", hoje, { modalidade: "megasena", ok: false, verificadoEm: hoje.toISOString(), divergencias: ["preco mudou"] }).desatualizado).toBe(true);
  });

  it("conferencia do texto oficial: pagina vazia ou sem preco nunca vira ok", () => {
    const agora = new Date();
    expect(R.conferirTextoOficial("quina", "", agora).ok).toBe(false);
    const precos = Object.values(R.REGRAS.quina.precosCentavos).map((c) => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })).join(" ");
    const bom = `Marque de 5 a 15 números dentre os 80 disponíveis. O preço da aposta com 5 números é de R$ 3,00. ${precos} ${"x ".repeat(300)}`;
    expect(R.conferirTextoOficial("quina", bom, agora)).toMatchObject({ ok: true, divergencias: [] });
    expect(R.conferirTextoOficial("quina", bom.replace("9.009,00", "9.999,00"), agora).ok).toBe(false);
  });
});

describe("resultados oficiais (fonte simulada)", () => {
  const json = (slug: string, num: number, dez: number[]) => JSON.stringify({
    numero: num, dataApuracao: "10/11/2026", listaDezenas: dez.map((d) => String(d).padStart(2, "0")),
    numeroConcursoAnterior: num - 1, numeroConcursoProximo: num + 1, dataProximoConcurso: "17/11/2026", tipoJogo: slug,
  });
  const mega = (num: number) => json("MEGA", num, jogoMega(num % 9));
  const fonteBoa = async (url: string) => {
    const m = /megasena(?:\/(\d+))?$/.exec(url);
    if (!m) return { status: 404, texto: "" };
    return { status: 200, texto: mega(m[1] ? Number(m[1]) : 3085) };
  };

  it("sem resposta: indisponivel, sem dado inventado", async () => {
    await RES.atualizarResultados("megasena", async () => { throw new Error("rede"); });
    const r = await RES.lerResultados("megasena");
    expect(r.estado).toBe("indisponivel"); expect(r.itens).toHaveLength(0); expect(r.erro).toBeTruthy();
  });

  it("5 ultimos concursos com data e horario de atualizacao", async () => {
    const agora = new Date();
    await RES.atualizarResultados("megasena", fonteBoa, agora);
    const r = await RES.lerResultados("megasena");
    expect(r.estado).toBe("ok");
    expect(r.itens.map((i) => i.concurso)).toEqual([3085, 3084, 3083, 3082, 3081]);
    expect(r.itens[0]!.dezenas).toHaveLength(6);
    expect(r.atualizadoEm).toBe(agora.toISOString());
    const prox = await RES.proximoConcurso("megasena");
    expect(prox).toMatchObject({ concurso: 3086, data: "2026-11-17" });
    await setJson("meus_jogos.proximo.megasena", { concurso: 5000, data: dia(3), obtidoEm: agora.toISOString() }); // restaura ambiente do teste
  });

  it("resposta fora do formato nao grava nada; falha depois do sucesso marca desatualizado e mantem o que ja existia", async () => {
    expect(RES.normalizarResultado("megasena", { numero: 1, dataApuracao: "31/02/2026", listaDezenas: ["01", "02", "03", "04", "05", "06"] })).toBeNull();
    expect(RES.normalizarResultado("megasena", { numero: 1, dataApuracao: "10/11/2026", listaDezenas: ["01", "02", "03", "04", "05", "99"] })).toBeNull();
    expect(RES.normalizarResultado("megasena", { numero: 1, dataApuracao: "10/11/2026", listaDezenas: ["01", "01", "03", "04", "05", "06"] })).toBeNull();
    expect(RES.normalizarResultado("lotomania", { numero: 5, dataApuracao: "10/11/2026", listaDezenas: Array.from({ length: 20 }, (_, i) => String(i * 5).padStart(2, "0")) })).not.toBeNull();
    const antes = await n(`SELECT COUNT(*) n FROM meus_jogos_resultados`);
    await RES.atualizarResultados("megasena", async () => ({ status: 200, texto: "<html>erro</html>" }));
    expect(await n(`SELECT COUNT(*) n FROM meus_jogos_resultados`)).toBe(antes);
    const r = await RES.lerResultados("megasena");
    expect(r.estado).toBe("desatualizado"); expect(r.itens.length).toBe(5);
  });

  it("rota de resultados exige login e, sem rede, informa indisponibilidade sem inventar", async () => {
    expect((await request(app).get(`${P}/resultados`)).status).toBe(401);
    const real = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("sem rede (teste)"); }) as any;
    try {
      await pool.query(`DELETE FROM app_settings WHERE key LIKE 'meus_jogos.resultados.%'`);
      await pool.query(`DELETE FROM meus_jogos_resultados WHERE modalidade <> 'megasena'`);
      const r = await request(app).get(`${P}/resultados`).set(H(1));
      expect(r.status).toBe(200);
      const quina = r.body.modalidades.find((x: any) => x.modalidade === "quina");
      expect(quina).toMatchObject({ estado: "indisponivel", itens: [] });
    } finally { globalThis.fetch = real; }
  });

  it("conferirFonte so grava quando a pagina foi realmente lida", async () => {
    await RES.conferirFonte(async () => ({ status: 503, texto: "" }), new Date());
    const c = await RES.lerConferencia("quina");
    expect(c?.ok).toBe(true); // continua a conferencia boa do ambiente de teste
    const out = await RES.conferirFonte(async () => ({ status: 200, texto: "pagina qualquer sem as regras" }), new Date());
    expect(out.every((x) => !x.ok)).toBe(true);
    expect((await RES.lerConferencia("quina"))?.ok).toBe(false);
    const agora = new Date().toISOString();
    for (const m of R.MODALIDADES) await setJson(`meus_jogos.fonte.${m}`, { modalidade: m, ok: true, verificadoEm: agora, divergencias: [] });
  });
});

describe("portal: login, catalogo, favoritos e bloqueio sem robo", () => {
  it("exige token; catalogo mostra execucao indisponivel e precos do servidor", async () => {
    expect((await request(app).get(P)).status).toBe(401);
    expect((await request(app).get(P).set("Authorization", "Bearer invalido")).status).toBe(401);
    expect((await request(app).post(`${P}/pedidos`).send({})).status).toBe(401);
    const r = await request(app).get(P).set(H(1));
    expect(r.status).toBe(200);
    expect(r.body.membro).toBe(true);
    expect(r.body.execucao.disponivel).toBe(false);
    const mega = r.body.modalidades.find((m: any) => m.chave === "megasena");
    expect(mega.precos.find((p: any) => p.quantidade === 6).precoCentavos).toBe(600);
    expect(mega.disponibilidade).toMatchObject({ aberto: false, motivo: "execucao_indisponivel" });
    expect(JSON.stringify(r.body)).not.toMatch(/prata|ouro|platinum|diamond/i);
  });

  it("sem robo conectado a API recusa pedido (503) e nada e gravado", async () => {
    ROBO.definirRobo(null);
    const r = await request(app).post(`${P}/pedidos`).set(H(1)).send({ modalidade: "megasena", jogos: [DEZ6], chave: chave() });
    expect(r.status).toBe(503); expect(r.body.motivo).toBe("execucao_indisponivel");
    expect(await n(`SELECT COUNT(*) n FROM meus_jogos_pedidos`)).toBe(0);
  });

  it("nao membro nao salva favorito nem pede; membro salva, repete sem duplicar e remove so o proprio", async () => {
    expect((await request(app).post(`${P}/favoritos`).set(H(4)).send({ modalidade: "megasena", dezenas: DEZ6 })).status).toBe(403);
    expect((await request(app).post(`${P}/favoritos`).set(H(1)).send({ modalidade: "megasena", dezenas: [1, 2, 3] })).status).toBe(422);
    expect((await request(app).post(`${P}/favoritos`).set(H(1)).send({ modalidade: "bingo", dezenas: DEZ6 })).status).toBe(400);
    const a = await request(app).post(`${P}/favoritos`).set(H(1)).send({ modalidade: "megasena", dezenas: [6, 5, 4, 3, 2, 1], apelido: "Aniversario" });
    expect(a.status).toBe(201);
    const b = await request(app).post(`${P}/favoritos`).set(H(1)).send({ modalidade: "megasena", dezenas: DEZ6 });
    expect(b.status).toBe(200); expect(b.body.jaExistia).toBe(true);
    const lista = await request(app).get(`${P}/favoritos`).set(H(1));
    expect(lista.body.favoritos).toHaveLength(1);
    expect(lista.body.favoritos[0].dezenas).toEqual(DEZ6);
    expect((await request(app).get(`${P}/favoritos`).set(H(2))).body.favoritos).toHaveLength(0);
    expect((await request(app).delete(`${P}/favoritos/${a.body.id}`).set(H(2))).status).toBe(404);
    expect((await request(app).delete(`${P}/favoritos/${a.body.id}`).set(H(1))).status).toBe(200);
  });
});

describe("pedidos: criacao, idempotencia e prazos (robo simulado)", () => {
  const robo = roboFalso();
  it("cria pedido com preco do servidor, prazos e evento; mesma chave repete sem duplicar", async () => {
    const k = chave();
    const r = await L.criarPedido({ clientId: 1, modalidade: "megasena", jogos: [DEZ6, jogoMega(1)], idempotencyKey: k, robo });
    expect(r).toMatchObject({ ok: true, repetido: false });
    const ped = (await q(`SELECT * FROM meus_jogos_pedidos WHERE id = $1`, [(r as any).id]))[0];
    expect(ped).toMatchObject({ empresa_id: 1, client_id: 1, status: "aguardando_pagamento", total_centavos: 1200, qtd_jogos: 2, concurso: 5000 });
    expect(new Date(ped.limite_interno_em).getTime()).toBe(new Date(ped.fechamento_oficial_em).getTime() - 240 * 60_000);
    expect(new Date(ped.fechamento_oficial_em).toISOString()).toBe(new Date(`${dia(3)}T20:00:00-03:00`).toISOString());
    const rep = await L.criarPedido({ clientId: 1, modalidade: "megasena", jogos: [jogoMega(1), DEZ6], idempotencyKey: k, robo });
    expect(rep).toMatchObject({ ok: true, repetido: true, id: (r as any).id });
    expect(await L.criarPedido({ clientId: 1, modalidade: "megasena", jogos: [jogoMega(2)], idempotencyKey: k, robo })).toMatchObject({ ok: false, motivo: "chave_reutilizada" });
    expect(await n(`SELECT COUNT(*) n FROM meus_jogos_eventos WHERE evento = 'pedido_criado'`)).toBe(1);
  });

  it("mesmos jogos com outra chave = duplicidade; concorrencia cria um unico pedido", async () => {
    const jogos = [jogoMega(3)];
    expect(await L.criarPedido({ clientId: 1, modalidade: "megasena", jogos, idempotencyKey: chave(), robo })).toMatchObject({ ok: true });
    expect(await L.criarPedido({ clientId: 1, modalidade: "megasena", jogos, idempotencyKey: chave(), robo })).toMatchObject({ ok: false, motivo: "pedido_duplicado" });
    const alvo = [jogoMega(4)];
    const rs = await Promise.all(Array.from({ length: 6 }, () => L.criarPedido({ clientId: 1, modalidade: "megasena", jogos: alvo, idempotencyKey: chave(), robo })));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.filter((r) => !r.ok).every((r: any) => r.motivo === "pedido_duplicado")).toBe(true);
    const k = chave();
    const mesmaChave = await Promise.all(Array.from({ length: 6 }, () => L.criarPedido({ clientId: 1, modalidade: "megasena", jogos: [jogoMega(5)], idempotencyKey: k, robo })));
    expect(mesmaChave.every((r) => r.ok)).toBe(true);
    expect(new Set(mesmaChave.map((r: any) => r.id)).size).toBe(1);
  });

  it("recusa: nao membro, jogo invalido, repetido, acima do teto, chave ruim, fora do prazo, regras desatualizadas, sem fechamento", async () => {
    const c = (o: any) => L.criarPedido({ clientId: 1, modalidade: "megasena", jogos: [DEZ6], idempotencyKey: chave(), robo, ...o });
    expect(await c({ clientId: 4 })).toMatchObject({ motivo: "nao_membro" });
    expect(await c({ jogos: [[1, 2, 3]] })).toMatchObject({ motivo: "jogos_invalidos" });
    expect(await c({ jogos: [DEZ6, DEZ6] })).toMatchObject({ motivo: "jogo_repetido" });
    expect(await c({ jogos: [] })).toMatchObject({ motivo: "quantidade_jogos" });
    expect(await c({ jogos: [Array.from({ length: 20 }, (_, i) => i + 1)] })).toMatchObject({ motivo: "acima_do_teto" }); // R$ 232.560,00
    expect(await c({ idempotencyKey: "curta" })).toMatchObject({ motivo: "chave_invalida" });
    const fecha = new Date(`${dia(3)}T20:00:00-03:00`).getTime();
    expect(await c({ agora: new Date(fecha - 239 * 60_000) })).toMatchObject({ motivo: "concurso_nao_selecionado" });
    expect(await c({ concurso: 5000, agora: new Date(fecha - 239 * 60_000), jogos: [jogoMega(9)] })).toMatchObject({ motivo: "fora_do_prazo" });
    expect(await c({ concurso: 5001, agora: new Date(fecha - 239 * 60_000), jogos: [jogoMega(8)] })).toMatchObject({ ok: true });
    expect(await c({ agora: new Date(fecha - 241 * 60_000), jogos: [jogoMega(9)] })).toMatchObject({ ok: true });
    expect(await c({ agora: new Date(Date.now() + 5 * 86_400_000), jogos: [jogoMega(8)] })).toMatchObject({ motivo: "concurso_desconhecido" });
    expect(await c({ clientId: 3, jogos: [jogoMega(7)] })).toMatchObject({ ok: true }); // prazo oficial e global, nao depende do horario digitado por clinica
    expect(await c({ robo: roboFalso({ disponivel: false }) })).toMatchObject({ motivo: "execucao_indisponivel" });
    await setJson("meus_jogos.fonte.megasena", { modalidade: "megasena", ok: false, verificadoEm: new Date().toISOString(), divergencias: ["preco mudou"] });
    expect(await c({ jogos: [jogoMega(6)] })).toMatchObject({ motivo: "regras_desatualizadas" });
    await setJson("meus_jogos.fonte.megasena", { modalidade: "megasena", ok: true, verificadoEm: new Date().toISOString(), divergencias: [] });
  });

  it("rota cria pedido quando ha robo e protege o pedido de outro cliente e de outra clinica", async () => {
    ROBO.definirRobo(roboFalso() as any);
    try {
      const r = await request(app).post(`${P}/pedidos`).set(H(2)).send({ modalidade: "megasena", jogos: [jogoN(40)], chave: chave() });
      expect(r.status).toBe(201);
      const id = r.body.id;
      expect((await request(app).get(`${P}/pedidos/${id}`).set(H(2))).status).toBe(200);
      expect((await request(app).get(`${P}/pedidos/${id}`).set(H(1))).status).toBe(404);
      expect((await request(app).get(`${P}/pedidos/${id}`).set(H(3))).status).toBe(404);
      expect((await request(app).post(`${P}/pedidos/${id}/cancelar`).set(H(1))).status).toBe(404);
      expect((await request(app).get(`${P}/pedidos/${id}/comprovante`).set(H(2))).status).toBe(404);
      expect((await request(app).get(`${P}/pedidos`).set(H(1))).body.pedidos.every((p: any) => p.id !== id)).toBe(true);
      expect((await request(app).post(`${P}/pedidos/${id}/cancelar`).set(H(2))).status).toBe(200);
      expect((await request(app).post(`${P}/pedidos/${id}/pagar`).set(H(2))).status).toBe(409); // cancelado
    } finally { ROBO.definirRobo(null); }
  });
});

describe("pagamento, fila, comprovante e devolucao", () => {
  const novo = async (clientId: number, i: number, robo: any, agora?: Date) => {
    const r = await L.criarPedido({ clientId, modalidade: "megasena", jogos: [jogoN(i)], idempotencyKey: chave(), robo, agora });
    if (!r.ok) throw new Error(`pedido nao criado: ${r.motivo}`);
    return r.id;
  };
  const estado = async (id: number) => (await q(`SELECT status FROM meus_jogos_pedidos WHERE id = $1`, [id]))[0].status as string;

  it("cobranca unica por pedido; cliente sem cadastro no Asaas e recusado; robo indisponivel nao inicia pagamento", async () => {
    const robo = roboFalso(); const as = asaasFalso();
    const id = await novo(1, 1, robo);
    const a = await L.iniciarPagamento({ clientId: 1, pedidoId: id, deps: as, robo });
    const b = await L.iniciarPagamento({ clientId: 1, pedidoId: id, deps: as, robo });
    expect(a).toMatchObject({ ok: true }); expect(b).toMatchObject({ ok: true });
    expect(as.st.criadas).toBe(1);
    expect([...as.st.cobrancas.values()][0]).toMatchObject({ valueReais: 6, externalReference: `meusjogos:${id}` });
    expect(await L.iniciarPagamento({ clientId: 2, pedidoId: id, deps: as, robo })).toMatchObject({ ok: false, motivo: "inexistente" });
    const semAsaas = await novo(2, 2, robo);
    expect(await L.iniciarPagamento({ clientId: 2, pedidoId: semAsaas, deps: as, robo })).toMatchObject({ ok: false, motivo: "cliente_sem_cadastro_pagamento" });
    expect(await L.iniciarPagamento({ clientId: 1, pedidoId: id, deps: as, robo: roboFalso({ disponivel: false }) })).toMatchObject({ ok: false, motivo: "execucao_indisponivel" });
    expect((await L.cancelarPedido(1, id))).toBe("estado_invalido"); // com cobranca nao cancela
  });

  it("pagamento so conta com status, valor e referencia conferidos; consulta que falha nao muda nada", async () => {
    const robo = roboFalso(); const as = asaasFalso();
    const id = await novo(1, 3, robo);
    await L.iniciarPagamento({ clientId: 1, pedidoId: id, deps: as, robo });
    const chg = (await q(`SELECT asaas_charge_id FROM meus_jogos_pedidos WHERE id = $1`, [id]))[0].asaas_charge_id;
    await L.sincronizarPagamento(id, as); expect(await estado(id)).toBe("aguardando_pagamento");
    as.st.cobrancas.get(chg).status = "RECEIVED"; as.st.cobrancas.get(chg).valueReais = 1;
    await L.sincronizarPagamento(id, as); expect(await estado(id)).toBe("aguardando_pagamento");
    expect(await n(`SELECT COUNT(*) n FROM meus_jogos_eventos WHERE pedido_id = ${id} AND evento = 'pagamento_divergente'`)).toBe(1);
    as.st.cobrancas.get(chg).valueReais = 6; as.st.cobrancas.get(chg).externalReference = "meusjogos:99999";
    await L.sincronizarPagamento(id, as); expect(await estado(id)).toBe("aguardando_pagamento");
    as.st.cobrancas.get(chg).externalReference = `meusjogos:${id}`; as.st.consultaFalha = true;
    await L.sincronizarPagamento(id, as); expect(await estado(id)).toBe("aguardando_pagamento");
    as.st.consultaFalha = false;
    await L.sincronizarPagamento(id, as); expect(await estado(id)).toBe("pago_na_fila");
    const ped = (await q(`SELECT pago_em, meta_efetivacao_em FROM meus_jogos_pedidos WHERE id = $1`, [id]))[0];
    expect(new Date(ped.meta_efetivacao_em).getTime() - new Date(ped.pago_em).getTime()).toBe(30 * 60_000);
    await L.sincronizarPagamento(id, as); expect(await estado(id)).toBe("pago_na_fila"); // repetir nao reabre nem duplica
    expect(await n(`SELECT COUNT(*) n FROM meus_jogos_eventos WHERE pedido_id = ${id} AND para = 'pago_na_fila'`)).toBe(1);
  });

  it("sem robo a fila nao toca em nenhum pedido; com robo: processando e so efetiva com comprovante valido", async () => {
    const robo = roboFalso({ estado: { estado: "em_andamento" } }); const as = asaasFalso();
    const id = await novo(1, 4, robo);
    await L.iniciarPagamento({ clientId: 1, pedidoId: id, deps: as, robo });
    const chg = (await q(`SELECT asaas_charge_id FROM meus_jogos_pedidos WHERE id = $1`, [id]))[0].asaas_charge_id;
    as.st.cobrancas.get(chg).status = "RECEIVED_IN_CASH"; await L.sincronizarPagamento(id, as);
    expect(await L.processarFila(roboFalso({ disponivel: false }))).toMatchObject({ robotIndisponivel: true, enviados: 0 });
    expect(await estado(id)).toBe("pago_na_fila");
    const resumo = await L.processarFila(robo);
    expect(resumo.enviados).toBeGreaterThanOrEqual(1);
    expect(await estado(id)).toBe("processando");
    expect(robo.chamadas.find((c: any) => c.pedidoId === id)).toMatchObject({ pedidoId: id, chave: `mj-${id}`, modalidade: "megasena", concurso: 5000 });
    expect((await L.processarFila(robo)).enviados).toBe(0); // nao reenvia
    expect(await L.anexarComprovante({ pedidoId: id, empresaId: 1, bytes: Buffer.from("isto nao e pdf nem imagem"), origem: "gestor", ator: "gestor:7" })).toMatchObject({ ok: false, motivo: "arquivo_invalido" });
    expect(await estado(id)).toBe("processando");
    const antes = await L.obterPedido(1, id);
    expect(antes!.comprovante).toBeNull(); expect(antes!.status).not.toBe("efetivado");
    expect(await L.anexarComprovante({ pedidoId: id, empresaId: 2, bytes: pdf("x"), origem: "gestor", ator: "gestor:8" })).toMatchObject({ ok: false, motivo: "inexistente" }); // outra clinica
    expect(await L.anexarComprovante({ pedidoId: id, empresaId: 1, bytes: pdf("ok"), origem: "gestor", ator: "gestor:7" })).toEqual({ ok: true });
    expect(await estado(id)).toBe("efetivado");
    expect(await L.anexarComprovante({ pedidoId: id, empresaId: 1, bytes: pdf("2"), origem: "gestor", ator: "gestor:7" })).toMatchObject({ ok: false, motivo: "estado_invalido" });
    const dep = await L.obterPedido(1, id);
    expect(dep!.comprovante).toMatchObject({ mime: "application/pdf" }); expect(dep!.linhaDoTempo.every((p) => p.estado === "feito")).toBe(true);
    expect((await L.baixarComprovante(1, null, id))!.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await L.baixarComprovante(2, null, id)).toBeNull();
    expect(await L.baixarComprovante(null, 2, id)).toBeNull();
    const chaveObj = (await q(`SELECT storage_key FROM meus_jogos_comprovantes WHERE pedido_id = $1`, [id]))[0].storage_key as string;
    expect(chaveObj).toMatch(/^meus-jogos\/comprovantes\/1\//);
    mem.files.set(chaveObj, pdf("adulterado")); // arquivo trocado no armazenamento
    expect(await L.baixarComprovante(1, null, id)).toBeNull();
    mem.files.set(chaveObj, pdf("ok"));
    expect(await L.baixarComprovante(1, null, id)).not.toBeNull();
  });

  it("suspende o despacho quando a fonte vence e só retoma após reconferência manual", async () => {
    const as = asaasFalso(); const robo = roboFalso();
    const id = await novo(1, 11, robo);
    await L.iniciarPagamento({ clientId: 1, pedidoId: id, deps: as, robo });
    const charge = (await q(`SELECT asaas_charge_id FROM meus_jogos_pedidos WHERE id = $1`, [id]))[0].asaas_charge_id;
    as.st.cobrancas.get(charge).status = "RECEIVED";
    await L.sincronizarPagamento(id, as);
    await setJson("meus_jogos.calendario.oficial", null);

    const suspensa = await L.processarFila(robo);
    expect(suspensa).toMatchObject({ enviados: 0, suspensos: 1 });
    expect(robo.chamadas).toHaveLength(0);
    expect(await q(`SELECT status, suspenso_motivo FROM meus_jogos_pedidos WHERE id = $1`, [id])).toMatchObject([{ status: "pago_na_fila", suspenso_motivo: expect.stringContaining("calendario_indisponivel") }]);

    await setJson("meus_jogos.calendario.oficial", calendarioFake);
    expect(await L.processarFila(robo)).toMatchObject({ enviados: 1, suspensos: 0 });
    expect(await q(`SELECT status, suspenso_motivo, despachado_em FROM meus_jogos_pedidos WHERE id = $1`, [id])).toMatchObject([{ status: "processando", suspenso_motivo: null, despachado_em: expect.any(Date) }]);
    expect(await n(`SELECT COUNT(*) n FROM meus_jogos_eventos WHERE pedido_id = ${id} AND evento = 'despacho_retomado'`)).toBe(1);
  });

  it("robo que devolve registrado com comprovante efetiva sozinho; recusa sem aposta abre devolucao", async () => {
    const as = asaasFalso();
    const pagar = async (i: number, robo: any) => {
      const id = await novo(1, i, robo);
      await L.iniciarPagamento({ clientId: 1, pedidoId: id, deps: as, robo });
      const chg = (await q(`SELECT asaas_charge_id FROM meus_jogos_pedidos WHERE id = $1`, [id]))[0].asaas_charge_id;
      as.st.cobrancas.get(chg).status = "RECEIVED"; await L.sincronizarPagamento(id, as);
      return id;
    };
    const rOk = roboFalso({ estado: { estado: "registrado", comprovante: { bytes: pdf("auto"), origem: "robo" } } });
    const id1 = await pagar(5, rOk);
    await L.processarFila(rOk); expect(await estado(id1)).toBe("efetivado");
    const rNo = roboFalso({ estado: { estado: "recusado_sem_aposta", motivo: "fechado" } });
    const id2 = await pagar(6, rNo);
    await L.processarFila(rNo); expect(await estado(id2)).toBe("devolucao_pendente");
    expect((await L.obterPedido(1, id2))!.falha!.texto).toMatch(/devolvido/i);
  });

  it("resultado incerto vai para conferencia (sem devolver, sem repetir); so atestado ou comprovante resolvem", async () => {
    const as = asaasFalso(); const robo = roboFalso({ registrar: "erro" });
    const id = await novo(1, 7, robo);
    await L.iniciarPagamento({ clientId: 1, pedidoId: id, deps: as, robo });
    const chg = (await q(`SELECT asaas_charge_id FROM meus_jogos_pedidos WHERE id = $1`, [id]))[0].asaas_charge_id;
    as.st.cobrancas.get(chg).status = "RECEIVED"; await L.sincronizarPagamento(id, as);
    expect((await L.processarFila(robo)).incertos).toBe(1);
    expect(await estado(id)).toBe("falha_em_conferencia");
    expect((await L.processarFila(robo)).enviados).toBe(0);
    expect(robo.chamadas).toHaveLength(1);
    expect((await L.reconciliarPrazos(new Date(Date.now() + 30 * 86_400_000), as)).devolucaoPendente).toBe(0); // pedido ja enviado nunca e devolvido por prazo
    expect(await estado(id)).toBe("falha_em_conferencia");
    expect(await L.registrarDevolucao({ empresaId: 1, pedidoId: id, referencia: "PIX-1", ator: "gestor:7" })).toMatchObject({ ok: false, motivo: "estado_invalido" });
    expect(await L.atestarSemAposta({ empresaId: 1, pedidoId: id, nota: "curta", ator: "gestor:7" })).toMatchObject({ motivo: "texto_invalido" });
    expect(await L.atestarSemAposta({ empresaId: 2, pedidoId: id, nota: "conferido na lotérica: nenhuma aposta", ator: "gestor:8" })).toMatchObject({ motivo: "inexistente" });
    expect(await L.atestarSemAposta({ empresaId: 1, pedidoId: id, nota: "conferido na lotérica: nenhuma aposta", ator: "gestor:7" })).toEqual({ ok: true });
    expect(await estado(id)).toBe("devolucao_pendente");
    expect(await L.registrarDevolucao({ empresaId: 1, pedidoId: id, referencia: "x", ator: "gestor:7" })).toMatchObject({ motivo: "texto_invalido" });
    expect(await L.registrarDevolucao({ empresaId: 1, pedidoId: id, referencia: "PIX-123", ator: "gestor:7" })).toEqual({ ok: true });
    expect(await estado(id)).toBe("devolvido");
    expect(await L.registrarDevolucao({ empresaId: 1, pedidoId: id, referencia: "PIX-123", ator: "gestor:7" })).toMatchObject({ motivo: "estado_invalido" });
    expect(L.transicaoPermitida("devolvido", "efetivado")).toBe(false);
    expect(L.transicaoPermitida("aguardando_pagamento", "efetivado")).toBe(false);
    expect(L.transicaoPermitida("pago_na_fila", "efetivado")).toBe(false);
  });

  it("pagamento depois do limite interno e pago nao processado ate o fechamento viram devolucao pendente; prazo sem pagamento expira", async () => {
    const as = asaasFalso(); const robo = roboFalso();
    const ped = (i: number) => novo(1, i, robo);
    const ped1 = await ped(8); await L.iniciarPagamento({ clientId: 1, pedidoId: ped1, deps: as, robo });
    const chg1 = (await q(`SELECT asaas_charge_id, limite_interno_em, fechamento_oficial_em FROM meus_jogos_pedidos WHERE id = $1`, [ped1]))[0];
    as.st.cobrancas.get(chg1.asaas_charge_id).status = "RECEIVED";
    await L.sincronizarPagamento(ped1, as, new Date(new Date(chg1.limite_interno_em).getTime() + 60_000));
    expect(await estado(ped1)).toBe("devolucao_pendente");
    expect((await L.obterPedido(1, ped1))!.falha!.texto).toMatch(/depois do prazo/i);

    const ped2 = await ped(9); await L.iniciarPagamento({ clientId: 1, pedidoId: ped2, deps: as, robo });
    const c2 = (await q(`SELECT asaas_charge_id FROM meus_jogos_pedidos WHERE id = $1`, [ped2]))[0].asaas_charge_id;
    as.st.cobrancas.get(c2).status = "RECEIVED"; await L.sincronizarPagamento(ped2, as);
    expect(await estado(ped2)).toBe("pago_na_fila");
    const depois = new Date(new Date(chg1.fechamento_oficial_em).getTime() + 60_000);
    const fila = await L.processarFila(robo, depois);
    expect(fila.enviados).toBe(0); // fechamento passou: nao envia; abre devolucao humana
    expect(fila.devolucaoPendente).toBeGreaterThanOrEqual(1);
    expect((await L.reconciliarPrazos(depois, as)).devolucaoPendente).toBe(0);
    expect(await estado(ped2)).toBe("devolucao_pendente");

    const ped3 = await ped(10);
    await L.reconciliarPrazos(depois, as);
    expect(await estado(ped3)).toBe("expirado");
  });
});

describe("gestor: login, isolamento e configuracao", () => {
  it("exige login e papel de gestor", async () => {
    como(null);
    expect((await request(app).get(`${G}/cliente/1`)).status).toBe(401);
    como(99, 1);
    expect((await request(app).get(`${G}/cliente/1`)).status).toBe(403);
    expect((await request(app).put(`${G}/config`).send({ margemMinutos: 60 })).status).toBe(403);
    expect((await request(app).post(`${G}/fila/processar`)).status).toBe(403);
  });

  it("gestor ve pedidos do cliente escolhido so da propria clinica", async () => {
    como(7, 1);
    const r = await request(app).get(`${G}/cliente/1`);
    expect(r.status).toBe(200);
    expect(r.body.cliente).toMatchObject({ id: 1, nome: "Maria Sintetica" });
    expect(r.body.membroAtivo).toBe(true);
    expect(r.body.pedidos.length).toBeGreaterThan(5);
    expect(r.body.pedidos.every((p: any) => p.jogos.length >= 1)).toBe(true);
    expect((await request(app).get(`${G}/cliente/3`)).status).toBe(404); // cliente da clinica B
    como(8, 2);
    expect((await request(app).get(`${G}/cliente/1`)).status).toBe(404);
    const pedidosCliente3 = (await request(app).get(`${G}/cliente/3`)).body.pedidos;
    expect(pedidosCliente3).toHaveLength(1);
    expect(await q(`SELECT DISTINCT client_id FROM meus_jogos_pedidos WHERE id = ANY($1::int[])`, [pedidosCliente3.map((p: any) => p.id)])).toEqual([{ client_id: 3 }]);
    como(7, 1);
  });

  it("configuracao: valida limites; horario exige fonte; margem editavel muda os prazos dos proximos pedidos", async () => {
    como(7, 1);
    expect((await request(app).put(`${G}/config`).send({ margemMinutos: -1 })).status).toBe(422);
    expect((await request(app).put(`${G}/config`).send({ fechamentoOficial: { megasena: "25:00" } })).status).toBe(422);
    expect((await request(app).put(`${G}/config`).send({ fechamentoOficial: { bingo: "10:00" } })).status).toBe(422);
    expect((await request(app).put(`${G}/config`).send({ fonteFechamento: "x" })).status).toBe(422);
    como(8, 2);
    expect((await request(app).put(`${G}/config`).send({ fechamentoOficial: { megasena: "19:00" } })).status).toBe(422); // sem fonte
    expect((await request(app).put(`${G}/config`).send({ fechamentoOficial: { megasena: "19:00" }, fonteFechamento: "Comunicado de teste da clinica B" })).status).toBe(200);
    como(7, 1);
    expect((await L.lerConfig(2)).fechamentoOficial.megasena).toBe("19:00");
    expect((await L.lerConfig(1)).margemMinutos).toBe(240);
    const ok = await request(app).put(`${G}/config`).send({ margemMinutos: 120 });
    expect(ok.status).toBe(200); expect(ok.body.config.margemMinutos).toBe(120);
    const d = await L.disponibilidade("megasena", 1, new Date(), roboFalso() as any);
    expect(new Date(d.prazos!.fechamentoOficialEm).getTime() - new Date(d.prazos!.limiteInternoEm).getTime()).toBe(120 * 60_000);
    await request(app).put(`${G}/config`).send({ margemMinutos: 240 });
    expect((await L.lerConfig(1)).fechamentoOficial.megasena).toBe("19:00"); // atualizar so a margem nao apaga o horario
  });

  it("painel mostra execucao indisponivel; fila sem robo informa e nao mexe em nada; atestado e devolucao pela rota", async () => {
    como(7, 1);
    const p = await request(app).get(`${G}/painel`);
    expect(p.status).toBe(200);
    expect(p.body.execucao.disponivel).toBe(false);
    expect(p.body.fontes).toHaveLength(4);
    expect(p.body.avatarMedico).toMatchObject({ fotoNoCadastro: true, acessoAoArquivo: "nao_verificado", autorizacaoDeUso: "nao_cadastrada", fotoUtilizada: false });
    expect(JSON.stringify(p.body.avatarMedico)).not.toContain("/private/doctor-photo");
    expect((await request(app).post(`${G}/fila/processar`)).status).toBe(409); // nenhuma aposta é enviada sem confirmação explícita
    const f = await request(app).post(`${G}/fila/processar`).send({ confirmarEnvio: true });
    expect(f.status).toBe(200); expect(f.body.fila.robotIndisponivel).toBe(true);
    expect((await request(app).post(`${G}/pedidos/999999/atestar-sem-aposta`).send({ nota: "conferido sem aposta alguma" })).status).toBe(404);
    expect((await request(app).post(`${G}/pedidos/999999/devolucao`).send({ referencia: "PIX-1" })).status).toBe(404);
    expect((await request(app).post(`${G}/pedidos/999999/comprovante`).attach("file", pdf("z"), "c.pdf")).status).toBe(404);
  });
});

describe("integridade do banco", () => {
  it("nenhum pedido efetivado sem comprovante ativo; nenhum comprovante sem pedido efetivado; log sem dado pessoal", async () => {
    expect(await n(`SELECT COUNT(*) n FROM meus_jogos_pedidos p WHERE status = 'efetivado' AND NOT EXISTS (SELECT 1 FROM meus_jogos_comprovantes c WHERE c.pedido_id = p.id AND c.revogado_em IS NULL)`)).toBe(0);
    expect(await n(`SELECT COUNT(*) n FROM meus_jogos_comprovantes c JOIN meus_jogos_pedidos p ON p.id = c.pedido_id WHERE p.status <> 'efetivado'`)).toBe(0);
    expect(await n(`SELECT COUNT(*) n FROM meus_jogos_pedidos WHERE status IN ('pago_na_fila','processando','efetivado','falha_em_conferencia','devolucao_pendente','devolvido') AND pago_em IS NULL`)).toBe(0);
    expect(await n(`SELECT COUNT(*) n FROM meus_jogos_pedidos p WHERE total_centavos <> (SELECT COALESCE(SUM(preco_centavos),0) FROM meus_jogos_pedido_jogos j WHERE j.pedido_id = p.id)`)).toBe(0);
    expect(await n(`SELECT COUNT(*) n FROM boloes_participacoes`)).toBe(0); // bolao e jogo individual nunca se misturam
    expect(await n(`SELECT COUNT(*) n FROM meus_jogos_eventos WHERE detalhe ~* '(cpf|senha|token|@)'`)).toBe(0);
  });
});
