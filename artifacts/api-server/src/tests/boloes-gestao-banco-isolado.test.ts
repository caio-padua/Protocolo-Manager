/**
 * Central de Boloes em PostgreSQL descartavel: quarentena, leitura simulada, casamento, aprovacao humana,
 * aprovacao automatica (desligada por padrao), duplicidade, privacidade entre clientes e entre clinicas,
 * correcao de associacao, revogacao, estados distintos e robo da pasta. Dados sinteticos; sem rede.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const auth = vi.hoisted(() => ({
  pid: 7 as number | null, empresaId: 1, autenticado: true,
  gestores: new Set<string>(["7:1", "8:2"]), owner: true,
}));
vi.mock("../lib/clinical-access", () => ({
  isPlatformOwner: vi.fn(async () => auth.owner),
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
const ia = vi.hoisted(() => ({ fn: async (..._a: any[]): Promise<any> => { throw new Error("nao configurado"); }, chamadas: 0 }));
vi.mock("../lib/boloes-leitura", () => ({
  lerComprovanteIA: (...a: any[]) => { ia.chamadas++; return ia.fn(...a); },
}));
const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
process.env.SESSION_SECRET = "x".repeat(32);
let app: express.Express; let pool: any; let tok: (id: number) => string;
let gestaoLib: typeof import("../lib/boloes-gestao");
let robo: typeof import("../lib/boloes-robo");

const pdf = (n: string) => Buffer.from(`%PDF-1.4\n% recibo sintetico ${n}\n%%EOF\n`);
const H = (id: number) => ({ Authorization: `Bearer ${tok(id)}` });
const count = async (q: string) => Number((await pool.query(q)).rows[0].n);
const leitura = (o: Record<string, unknown> = {}) => ({
  pareceReciboCaixa: true, concurso: "0001", dataSorteio: "2026-12-31", codigoRecibo: "COD-1", cotas: 3,
  valor: null, nomeImpresso: null, emissor: "Lotérica sintética", confianca: 0.95, ...o,
});
const como = (pid: number, empresaId: number) => { auth.pid = pid; auth.empresaId = empresaId; auth.autenticado = true; };
const G = "/api/boloes/gestao";
const enviar = (n: string, extra?: Buffer) =>
  request(app).post(`${G}/recebimentos`).attach("file", extra ?? pdf(n), `recibo-${n}.pdf`);

beforeAll(async () => {
  const db = await import("@workspace/db");
  pool = db.pool;
  await pool.query(`CREATE TABLE empresas (id serial primary key, nome text)`);
  await pool.query(`INSERT INTO empresas (nome) VALUES ('Clinica A'),('Clinica B')`);
  await pool.query(`CREATE TABLE clients (id serial primary key, name text, empresa_id int, deleted_at timestamptz)`);
  await pool.query(`CREATE TABLE app_settings (key text primary key, value text, updated_at timestamptz default now())`);
  await pool.query(`INSERT INTO clients (name, empresa_id) VALUES
    ('Maria Sintetica Um',1),('Joao Sintetico Dois',1),('Ana Sintetica Tres',2),('Pedro Sintetico Quatro',1),('Lucia Sintetica Cinco',1)`);
  const base = await import("../lib/boloes");
  await base.ensureBoloesTables();
  await base.ensureBoloesTables(); // idempotente
  gestaoLib = await import("../lib/boloes-gestao");
  robo = await import("../lib/boloes-robo");
  tok = (await import("../lib/portal-token")).createPortalToken;
  app = express(); app.use(express.json());
  app.use((req: any, _r, n) => {
    req.log = { error() {}, warn() {}, info() {} };
    req.tenantContext = { empresaId: auth.empresaId, isPlatformOwner: false, perfilPlataforma: "admin", authenticated: auth.autenticado, professionalId: auth.pid };
    n();
  });
  app.use("/api", (await import("../routes/boloes")).default);
  app.use("/api", (await import("../routes/boloes-gestao")).default);
}, 90_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });

let campA = 0; let campB = 0; let part1 = 0; let part2 = 0; let part3 = 0; let part4 = 0; let part5 = 0;
let rec1 = 0; let comp1 = 0;

describe("acesso do gestor", () => {
  it("exige login, e gestor da clinica; cliente comum e gestor de outra clinica sao barrados", async () => {
    auth.pid = null;
    expect((await request(app).get(`${G}/resumo`)).status).toBe(401);
    como(7, 1); auth.autenticado = false;
    expect((await request(app).get(`${G}/resumo`)).status).toBe(401);
    como(99, 1); // profissional sem concessao de gestor
    expect((await request(app).get(`${G}/resumo`)).status).toBe(403);
    expect((await request(app).get(`${G}/recebimentos`)).status).toBe(403);
    expect((await request(app).post(`${G}/campanhas`).send({ nome: "X" })).status).toBe(403);
    como(8, 1); // gestor da clinica 2 tentando operar a clinica 1
    expect((await request(app).get(`${G}/resumo`)).status).toBe(403);
    como(7, 1);
    const r = await request(app).get(`${G}/resumo`);
    expect(r.status).toBe(200);
    expect(r.body.config).toEqual({ driveFolderId: null, autoAprovar: false });
    expect(r.headers["cache-control"]).toMatch(/no-store/);
  });

  it("cadastro de campanha e participacao pelo gestor fica preso a clinica dele", async () => {
    como(7, 1);
    expect((await request(app).post(`${G}/campanhas`).send({ nome: "" })).status).toBe(400);
    campA = (await request(app).post(`${G}/campanhas`).send({ nome: "Bolão sintético A", concurso: "0001", dataSorteio: "2026-12-31" })).body.id;
    como(8, 2);
    campB = (await request(app).post(`${G}/campanhas`).send({ nome: "Bolão sintético B", concurso: "0001", dataSorteio: "2026-12-31" })).body.id;
    como(7, 1);
    // cliente 3 e campanha B sao da clinica 2: o gestor da clinica 1 nao enxerga
    expect((await request(app).post(`${G}/participacoes`).send({ campanhaId: campB, clientId: 3, cotas: 3 })).status).toBe(404);
    expect((await request(app).post(`${G}/participacoes`).send({ campanhaId: campA, clientId: 3, cotas: 3 })).status).toBe(404);
    part1 = (await request(app).post(`${G}/participacoes`).send({ campanhaId: campA, clientId: 1, cotas: 3 })).body.id;
    part2 = (await request(app).post(`${G}/participacoes`).send({ campanhaId: campA, clientId: 2, cotas: 2 })).body.id;
    expect((await request(app).post(`${G}/participacoes`).send({ campanhaId: campA, clientId: 1, cotas: 1 })).status).toBe(409);
    como(8, 2);
    part3 = (await request(app).post(`${G}/participacoes`).send({ campanhaId: campB, clientId: 3, cotas: 3 })).body.id;
    como(7, 1);
    const lista = (await request(app).get(`${G}/participacoes`)).body;
    expect(lista.participacoes.map((p: any) => p.id).sort()).toEqual([part1, part2].sort());
    expect(lista.campanhas.map((c: any) => c.id)).toEqual([campA]);
  });
});

describe("recebimento, leitura e associacao", () => {
  it("arquivo manual entra na quarentena, e lido, sugere UMA participacao e NAO libera ao cliente", async () => {
    como(7, 1);
    ia.fn = async () => leitura({ codigoRecibo: "COD-1" });
    const r = await enviar("1");
    expect(r.status).toBe(201);
    rec1 = r.body.id;
    expect(r.body.resultado).toMatchObject({ estado: "em_revisao", sugerida: part1 });
    const fila = (await request(app).get(`${G}/recebimentos?status=em_revisao`)).body.recebimentos;
    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({ id: rec1, status: "em_revisao", sugerida: { participacaoId: part1, cliente: "Maria Sintetica Um" } });
    expect(JSON.stringify(fila)).not.toMatch(/storage|boloes-quarentena|sha/);
    // cliente: nada de comprovante, pagamento e registro nao mudaram
    const cli = (await request(app).get("/api/area-paciente/boloes").set(H(1))).body.participacoes[0];
    expect(cli).toMatchObject({ status: "pendente_registro", comprovante: null, entrega: "indisponivel", pagamento: "nao_informado" });
    expect(await count(`SELECT COUNT(*) n FROM boloes_comprovantes`)).toBe(0);
  });

  it("recusa arquivo invalido sem guardar nada; duplicata nao entra de novo", async () => {
    const antes = mem.files.size;
    expect((await request(app).post(`${G}/recebimentos`).attach("file", Buffer.from("<html>"), { filename: "r.pdf", contentType: "application/pdf" })).status).toBe(422);
    expect((await request(app).post(`${G}/recebimentos`).attach("file", Buffer.alloc(0), "v.pdf")).status).toBe(400);
    expect((await request(app).post(`${G}/recebimentos`)).status).toBe(400);
    const dup = await enviar("1");
    expect(dup.status).toBe(409);
    expect(dup.body.duplicadoDe).toBe(rec1);
    expect(mem.files.size).toBe(antes);
    expect(await count(`SELECT COUNT(*) n FROM boloes_recebimentos WHERE status='em_revisao'`)).toBe(1);
  });

  it("aprovar exige confirmacao explicita, escolha valida e a clinica certa", async () => {
    const url = `${G}/recebimentos/${rec1}/aprovar`;
    expect((await request(app).post(url).send({ participacaoId: part1 })).status).toBe(400);
    expect((await request(app).post(url).send({ participacaoId: part1, confirmoReciboCaixaReal: false })).status).toBe(400);
    expect((await request(app).post(url).send({ participacaoId: part1, confirmoReciboCaixaReal: true, extra: 1 })).status).toBe(400);
    // participacao de outra clinica
    expect((await request(app).post(url).send({ participacaoId: part3, confirmoReciboCaixaReal: true })).status).toBe(404);
    // gestor de outra clinica nao enxerga este recebimento
    como(8, 2);
    expect((await request(app).post(url).send({ participacaoId: part3, confirmoReciboCaixaReal: true })).status).toBe(404);
    expect((await request(app).get(`${G}/recebimentos`)).body.recebimentos).toEqual([]);
    expect((await request(app).get(`${G}/recebimentos/${rec1}/arquivo`)).status).toBe(404);
    como(7, 1);
    expect(await count(`SELECT COUNT(*) n FROM boloes_comprovantes`)).toBe(0);
  });

  it("aprovacao humana libera o recibo ao participante certo e so a ele", async () => {
    const r = await request(app).post(`${G}/recebimentos/${rec1}/aprovar`).send({ participacaoId: part1, confirmoReciboCaixaReal: true });
    expect(r.status).toBe(201);
    comp1 = r.body.comprovanteId;
    expect((await request(app).post(`${G}/recebimentos/${rec1}/aprovar`).send({ participacaoId: part1, confirmoReciboCaixaReal: true })).status).toBe(409);
    const cli = (await request(app).get("/api/area-paciente/boloes").set(H(1))).body.participacoes[0];
    expect(cli).toMatchObject({ status: "registrada", entrega: "disponivel", comprovante: { id: comp1, tipo: "pdf" } });
    expect(cli.comprovante.integridadeCodigo).toMatch(/^[0-9a-f]{12}$/);
    // outro cliente da mesma clinica e cliente de outra clinica: 404 uniforme
    expect((await request(app).get(`/api/area-paciente/boloes/comprovantes/${comp1}/download`).set(H(2))).status).toBe(404);
    expect((await request(app).get(`/api/area-paciente/boloes/comprovantes/${comp1}/download`).set(H(3))).status).toBe(404);
    expect((await request(app).get("/api/area-paciente/boloes").set(H(2))).body.participacoes[0].comprovante).toBeNull();
    // o titular certo baixa; a entrega passa a "baixado"
    expect((await request(app).get(`/api/area-paciente/boloes/comprovantes/${comp1}/download`).set(H(1))).status).toBe(200);
    expect((await request(app).get("/api/area-paciente/boloes").set(H(1))).body.participacoes[0].entrega).toBe("baixado");
    const audit = (await pool.query(`SELECT validado_ator, recebimento_id FROM boloes_comprovantes WHERE id=${comp1}`)).rows[0];
    expect(audit).toEqual({ validado_ator: "gestor:7", recebimento_id: rec1 });
  });

  it("o mesmo arquivo nao vira comprovante de outra participacao", async () => {
    // reenvio do mesmo conteudo apos aprovado: barrado na entrada
    expect((await enviar("1")).status).toBe(409);
    // insercao direta do mesmo arquivo em outra participacao: barrado pelo indice unico
    const r = await request(app).post(`${G}/participacoes/${part2}/comprovante`)
      .field("confirmoReciboCaixaReal", "true").attach("file", pdf("1"), "r.pdf");
    expect(r.status).toBe(409);
    expect(await count(`SELECT COUNT(*) n FROM boloes_comprovantes WHERE revogado_em IS NULL`)).toBe(1);
  });

  it("recibo sem participacao aberta compativel vai para revisao com motivo claro", async () => {
    ia.fn = async () => leitura({ codigoRecibo: "COD-2" }); // cotas 3: part1 ja tem comprovante, part2 tem 2 cotas
    const r = await enviar("2");
    expect(r.body.resultado).toMatchObject({ estado: "em_revisao", sugerida: null });
    expect(r.body.resultado.motivos).toContain("sem_candidata");
  });

  it("duas candidatas: o robo nunca escolhe", async () => {
    part4 = (await request(app).post(`${G}/participacoes`).send({ campanhaId: campA, clientId: 4, cotas: 3 })).body.id;
    part5 = (await request(app).post(`${G}/participacoes`).send({ campanhaId: campA, clientId: 5, cotas: 3 })).body.id;
    ia.fn = async () => leitura({ codigoRecibo: "COD-3" });
    const r = await enviar("3");
    expect(r.body.resultado.estado).toBe("em_revisao");
    expect(r.body.resultado.sugerida).toBeNull();
    expect(r.body.resultado.motivos).toContain("varias_candidatas");
  });

  it("falha da leitura nao trava a fila: vai para revisao e pode ser relida", async () => {
    ia.fn = async () => { throw new Error("IA fora do ar"); };
    const r = await enviar("4");
    expect(r.status).toBe(201);
    expect(r.body.resultado).toMatchObject({ estado: "em_revisao", motivos: ["leitura_falhou"] });
    ia.fn = async () => leitura({ codigoRecibo: "COD-4", cotas: 2 });
    const again = await request(app).post(`${G}/recebimentos/${r.body.id}/reprocessar`);
    expect(again.status).toBe(200);
    expect(again.body.resultado.sugerida).toBe(part2);
    // reprocessar um item ja lido e aceito pelo servidor, mas nao um item aprovado/rejeitado
    const rej = await request(app).post(`${G}/recebimentos/${r.body.id}/rejeitar`).send({ motivo: "x" });
    expect(rej.status).toBe(400);
    expect((await request(app).post(`${G}/recebimentos/${r.body.id}/rejeitar`).send({ motivo: "Arquivo de teste" })).status).toBe(200);
    expect((await request(app).post(`${G}/recebimentos/${r.body.id}/reprocessar`)).status).toBe(409);
    expect((await request(app).post(`${G}/recebimentos/${r.body.id}/aprovar`).send({ participacaoId: part2, confirmoReciboCaixaReal: true })).status).toBe(409);
  });

  it("inserir comprovante direto exige confirmacao e conteudo real", async () => {
    const url = `${G}/participacoes/${part2}/comprovante`;
    expect((await request(app).post(url).attach("file", pdf("direto"), "r.pdf")).status).toBe(400);
    expect((await request(app).post(url).field("confirmoReciboCaixaReal", "true").attach("file", Buffer.from("<script>"), { filename: "r.pdf", contentType: "application/pdf" })).status).toBe(422);
    como(8, 2);
    expect((await request(app).post(url).field("confirmoReciboCaixaReal", "true").attach("file", pdf("direto"), "r.pdf")).status).toBe(404);
    como(7, 1);
    expect((await request(app).post(url).field("confirmoReciboCaixaReal", "true").attach("file", pdf("direto"), "r.pdf")).status).toBe(201);
  });
});

describe("corrigir associacoes", () => {
  it("reassociar move o comprovante, troca os estados e a privacidade acompanha, com trilha antes/depois", async () => {
    const comp2 = Number((await pool.query(`SELECT id n FROM boloes_comprovantes WHERE participacao_id=${part2} AND revogado_em IS NULL`)).rows[0].n);
    const url = `${G}/comprovantes/${comp1}/reassociar`;
    expect((await request(app).post(url).send({ destinoId: part4 })).status).toBe(400); // sem motivo
    expect((await request(app).post(url).send({ destinoId: part1, motivo: "teste" })).status).toBe(409); // mesmo destino
    expect((await request(app).post(url).send({ destinoId: part2, motivo: "teste" })).status).toBe(409); // destino ocupado
    expect((await request(app).post(url).send({ destinoId: part3, motivo: "teste" })).status).toBe(404); // outra clinica
    como(8, 2);
    expect((await request(app).post(url).send({ destinoId: part3, motivo: "teste" })).status).toBe(404); // comprovante de outra clinica
    como(7, 1);
    expect((await request(app).post(url).send({ destinoId: part4, motivo: "Recibo era do Pedro" })).status).toBe(200);
    expect((await request(app).get("/api/area-paciente/boloes").set(H(1))).body.participacoes[0])
      .toMatchObject({ status: "pendente_registro", comprovante: null, entrega: "indisponivel" });
    expect((await request(app).get("/api/area-paciente/boloes").set(H(4))).body.participacoes[0])
      .toMatchObject({ status: "registrada", comprovante: { id: comp1 } });
    expect((await request(app).get(`/api/area-paciente/boloes/comprovantes/${comp1}/download`).set(H(1))).status).toBe(404);
    expect((await request(app).get(`/api/area-paciente/boloes/comprovantes/${comp1}/download`).set(H(4))).status).toBe(200);
    expect(await count(`SELECT COUNT(*) n FROM boloes_auditoria WHERE acao='comprovante_reassociado' AND comprovante_id=${comp1}`)).toBe(2);
    expect(await count(`SELECT COUNT(*) n FROM boloes_auditoria WHERE acao='comprovante_reassociado' AND client_id=1 AND detalhe LIKE '%Pedro%'`)).toBe(1);
    expect(comp2).toBeGreaterThan(0);
  });

  it("revogar devolve o arquivo para a fila e tira o acesso do participante", async () => {
    const r = await request(app).post(`${G}/comprovantes/${comp1}/revogar`).send({ motivo: "Recibo incorreto" });
    expect(r.status).toBe(200);
    expect((await request(app).post(`${G}/comprovantes/${comp1}/revogar`).send({ motivo: "Recibo incorreto" })).status).toBe(404);
    expect((await request(app).get(`/api/area-paciente/boloes/comprovantes/${comp1}/download`).set(H(4))).status).toBe(404);
    expect((await request(app).get("/api/area-paciente/boloes").set(H(4))).body.participacoes[0]).toMatchObject({ status: "pendente_registro", comprovante: null });
    const fila = (await request(app).get(`${G}/recebimentos?status=em_revisao`)).body.recebimentos.find((x: any) => x.id === rec1);
    expect(fila.motivos.map((m: any) => m.codigo)).toEqual(["revogado"]);
    // o gestor pode aprovar o mesmo arquivo para a participacao correta
    const re = await request(app).post(`${G}/recebimentos/${rec1}/aprovar`).send({ participacaoId: part1, confirmoReciboCaixaReal: true });
    expect(re.status).toBe(201);
    expect((await request(app).get(`/api/area-paciente/boloes/comprovantes/${re.body.comprovanteId}/download`).set(H(1))).status).toBe(200);
    expect(await count(`SELECT COUNT(*) n FROM boloes_comprovantes WHERE sha256=(SELECT sha256 FROM boloes_recebimentos WHERE id=${rec1}) AND revogado_em IS NULL`)).toBe(1);
  });
});

describe("estados distintos e configuracao", () => {
  it("pagamento informado pela clinica nao registra a aposta nem libera comprovante", async () => {
    expect((await request(app).post(`${G}/participacoes/${part5}/pagamento`).send({ status: "pago" })).status).toBe(400);
    como(8, 2);
    expect((await request(app).post(`${G}/participacoes/${part5}/pagamento`).send({ status: "confirmado" })).status).toBe(404);
    como(7, 1);
    expect((await request(app).post(`${G}/participacoes/${part5}/pagamento`).send({ status: "confirmado" })).status).toBe(200);
    expect((await request(app).get("/api/area-paciente/boloes").set(H(5))).body.participacoes[0])
      .toMatchObject({ pagamento: "confirmado", status: "pendente_registro", comprovante: null, entrega: "indisponivel" });
    expect(await count(`SELECT COUNT(*) n FROM boloes_auditoria WHERE acao='pagamento_informado' AND detalhe='nao_informado -> confirmado'`)).toBe(1);
  });

  it("aprovacao automatica nasce desligada e so liga com confirmacao; pasta do Drive e validada", async () => {
    const c = `${G}/config`;
    expect((await request(app).put(c).send({ driveFolderId: "curta", autoAprovar: false })).status).toBe(400);
    expect((await request(app).put(c).send({ driveFolderId: null, autoAprovar: true })).status).toBe(400);
    como(8, 2);
    expect((await request(app).get(`${G}/resumo`)).body.config.autoAprovar).toBe(false);
    como(7, 1);
    expect((await request(app).put(c).send({ driveFolderId: "1AbCdEfGhIjKlMnOpQrStUv", autoAprovar: false })).status).toBe(200);
    expect((await request(app).get(`${G}/resumo`)).body.config).toEqual({ driveFolderId: "1AbCdEfGhIjKlMnOpQrStUv", autoAprovar: false });
    como(8, 2);
    expect((await request(app).get(`${G}/resumo`)).body.config.driveFolderId).toBeNull(); // config por clinica
    como(7, 1);
  });

  it("com a chave DESLIGADA, leitura perfeita continua exigindo humano; LIGADA, so libera com certeza total", async () => {
    // reabre uma participacao: part5 (3 cotas) e part4 ficam como candidatas -> ambiguidade; remove a ambiguidade cancelando part4
    await pool.query(`UPDATE boloes_participacoes SET status='cancelada' WHERE id=${part4}`);
    ia.fn = async () => leitura({ codigoRecibo: "COD-AUTO-1" });
    const off = await enviar("auto-off");
    expect(off.body.resultado).toMatchObject({ estado: "em_revisao", sugerida: part5 });
    expect(await count(`SELECT COUNT(*) n FROM boloes_comprovantes WHERE participacao_id=${part5}`)).toBe(0);
    await request(app).post(`${G}/recebimentos/${off.body.id}/rejeitar`).send({ motivo: "Teste de ligar a chave" });

    expect((await request(app).put(`${G}/config`).send({ driveFolderId: null, autoAprovar: true, confirmoAprovacaoAutomatica: true })).status).toBe(200);
    // confianca baixa: continua humano
    ia.fn = async () => leitura({ codigoRecibo: "COD-AUTO-2", confianca: 0.8 });
    const baixa = await enviar("auto-baixa");
    expect(baixa.body.resultado.estado).toBe("em_revisao");
    await request(app).post(`${G}/recebimentos/${baixa.body.id}/rejeitar`).send({ motivo: "Teste de confianca" });
    ia.fn = async () => leitura({ codigoRecibo: "COD-AUTO-2B", confianca: 0.5 });
    const muitoBaixa = await enviar("auto-muito-baixa");
    expect(muitoBaixa.body.resultado.motivos).toContain("confianca_baixa");
    await request(app).post(`${G}/recebimentos/${muitoBaixa.body.id}/rejeitar`).send({ motivo: "Teste de confianca muito baixa" });
    // certeza total: libera, com ator robo e trilha
    ia.fn = async () => leitura({ codigoRecibo: "COD-AUTO-3" });
    const alta = await enviar("auto-alta");
    expect(alta.body.resultado.estado).toBe("aprovado_automatico");
    const comp = (await pool.query(`SELECT validado_por, validado_ator FROM boloes_comprovantes WHERE participacao_id=${part5} AND revogado_em IS NULL`)).rows[0];
    expect(comp).toEqual({ validado_por: null, validado_ator: "robo:aprovacao-automatica" });
    expect((await request(app).get("/api/area-paciente/boloes").set(H(5))).body.participacoes[0]).toMatchObject({ status: "registrada", entrega: "disponivel" });
    // desligar de novo nao exige confirmacao
    expect((await request(app).put(`${G}/config`).send({ driveFolderId: null, autoAprovar: false })).status).toBe(200);
    expect(await count(`SELECT COUNT(*) n FROM boloes_auditoria WHERE acao='configuracao_alterada'`)).toBeGreaterThanOrEqual(3);
  });

  it("historico do gestor mostra so a propria clinica", async () => {
    const a = (await request(app).get(`${G}/auditoria`)).body.eventos;
    expect(a.length).toBeGreaterThan(5);
    como(8, 2);
    const b = (await request(app).get(`${G}/auditoria`)).body.eventos;
    expect(b.every((e: any) => !JSON.stringify(e).includes("COD-"))).toBe(true);
    expect(b.length).toBeLessThan(a.length);
    como(7, 1);
  });
});

describe("robo da pasta do Drive", () => {
  const alertas: string[] = [];
  const depsBase = (arquivos: Array<{ id: string; name: string; mimeType: string; buf?: Buffer; size?: number }>) => ({
    storage: new (class { async savePrivateObject(k: string, b: Buffer) { mem.files.set(k, b); } async readPrivateObject(k: string) { return mem.files.get(k)!; } async deletePrivateObject(k: string) { mem.files.delete(k); } })(),
    leitor: async () => leitura({ codigoRecibo: "COD-DRIVE" }) as any,
    listar: async () => arquivos.map((a) => ({ id: a.id, name: a.name, mimeType: a.mimeType, isFolder: false, size: a.size ?? a.buf?.length ?? null })),
    baixar: async (id: string) => arquivos.find((a) => a.id === id)!.buf!,
    alertar: async (t: string) => { alertas.push(t); },
  });

  it("sem pasta configurada em nenhuma clinica nao faz nada", async () => {
    await pool.query(`DELETE FROM app_settings`);
    const antes = await count(`SELECT COUNT(*) n FROM boloes_recebimentos`);
    const chamadasIA = ia.chamadas;
    const r = await robo.varrerPastasBoloes(depsBase([{ id: "f1", name: "a.pdf", mimeType: "application/pdf", buf: pdf("drive-0") }]));
    expect(r).toMatchObject({ empresasComPasta: 0, novos: 0 });
    expect(await count(`SELECT COUNT(*) n FROM boloes_recebimentos`)).toBe(antes);
    expect(ia.chamadas).toBe(chamadasIA);
  });

  it("com pasta: ingere, le, separa duplicata e tipo invalido, nao reprocessa o mesmo arquivo e avisa so quando ha revisao", async () => {
    await gestaoLib.gravarConfig(1, { driveFolderId: "1AbCdEfGhIjKlMnOpQrStUv", autoAprovar: false }, { texto: "teste", profissionalId: null });
    // part2 (2 cotas, sem comprovante ativo?) -> garante uma candidata aberta com 2 cotas
    ia.fn = async () => leitura({ codigoRecibo: "COD-DRIVE", cotas: 2 });
    const arquivos = [
      { id: "d1", name: "recibo.pdf", mimeType: "application/pdf", buf: pdf("drive-1") },
      { id: "d2", name: "copia-do-mesmo.pdf", mimeType: "application/pdf", buf: pdf("drive-1") }, // mesmo conteudo
      { id: "d3", name: "planilha.xlsx", mimeType: "application/vnd.ms-excel", buf: Buffer.from("x") },
      { id: "d4", name: "falso.pdf", mimeType: "application/pdf", buf: Buffer.from("<html>nao e pdf</html>") },
    ];
    const deps = depsBase(arquivos);
    deps.leitor = async () => leitura({ codigoRecibo: "COD-DRIVE", cotas: 2 }) as any;
    const r1 = await robo.varrerPastasBoloes(deps);
    expect(r1).toMatchObject({ empresasComPasta: 1, novos: 1, emRevisao: 1, duplicados: 1, rejeitados: 2, aprovadosAutomaticos: 0, erros: 0 });
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).not.toMatch(/Maria|Joao|Pedro|Lucia|COD-/); // sem dado pessoal no alerta
    const r2 = await robo.varrerPastasBoloes(deps);
    expect(r2).toMatchObject({ novos: 0, emRevisao: 0, duplicados: 0, rejeitados: 0 });
    expect(alertas).toHaveLength(1);
    expect(await count(`SELECT COUNT(*) n FROM boloes_recebimentos WHERE origem='drive'`)).toBe(4);
    expect(await count(`SELECT COUNT(*) n FROM boloes_comprovantes WHERE recebimento_id IN (SELECT id FROM boloes_recebimentos WHERE origem='drive')`)).toBe(0);
  });

  it("erro em um arquivo nao derruba a varredura", async () => {
    const deps = depsBase([
      { id: "e1", name: "a.pdf", mimeType: "application/pdf", buf: pdf("e1") },
      { id: "e2", name: "b.pdf", mimeType: "application/pdf", buf: pdf("e2") },
    ]);
    deps.baixar = async (id: string) => { if (id === "e1") throw new Error("Drive indisponivel"); return pdf("e2"); };
    deps.leitor = async () => { throw new Error("IA fora"); };
    const r = await robo.varrerPastasBoloes(deps);
    expect(r.erros).toBe(1);
    expect(r.novos).toBe(1);
    expect(r.emRevisao).toBe(1);
  });
});
