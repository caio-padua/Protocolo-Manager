/** Links de exame em PostgreSQL descartável, dados sintéticos: novo, legado, revogação, política de transição, rota do paciente. Nenhuma mensagem é enviada. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const ctx = vi.hoisted(() => ({ owner: true, empresa: 1 }));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, _res: any, next: any) => { req.tenantContext = { isPlatformOwner: ctx.owner, empresaId: ctx.empresa, professionalId: 7 }; next(); },
}));
vi.mock("../lib/objectStorage", () => ({ ObjectStorageService: class {} }));
vi.mock("../lib/pre-cadastro", async (orig) => ({ ...(await orig<typeof import("../lib/pre-cadastro")>()), lerEstadoPreCadastro: async () => ({ completo: true, pendentes: [], valores: {} }) }));
const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
process.env.SESSION_SECRET = "x".repeat(32);
let app: express.Express; let pool: any;
let patientTok: (id: number) => string; let novo: (p: any) => string;
const LEG1 = "a1".repeat(24), LEG2 = "b2".repeat(24), LEG_SEM_DATA = "c3".repeat(24);
const PDF = Buffer.from("%PDF-1.4 sintetico").toString("base64");

beforeAll(async () => {
  pool = (await import("@workspace/db")).pool;
  await pool.query(`CREATE TABLE clients (id serial primary key, name text, empresa_id int)`);
  await pool.query(`INSERT INTO clients (name, empresa_id) VALUES ('Sintético A',1),('Sintético B',1),('Sintético C',2)`);
  await pool.query(`CREATE TABLE app_settings (key text primary key, value text, updated_at timestamptz default now())`);
  await pool.query(`CREATE TABLE exam_request_pdfs (id serial primary key, token text unique not null, client_id int not null, professional_id int, approval_request_id int,
    tipo text not null default 'SANGUE', file_name text not null, exam_count int not null default 1, observacao text, pdf_data text not null, created_at timestamptz)`);
  await pool.query(`INSERT INTO exam_request_pdfs (token, client_id, file_name, pdf_data, created_at) VALUES
    ($1,1,'a.pdf',$4,'2026-06-16'),($2,2,'b.pdf',$4,'2026-06-16'),($3,1,'sem-data.pdf',$4,NULL)`, [LEG1, LEG2, LEG_SEM_DATA, PDF]);
  const pt = await import("../lib/portal-token"); patientTok = pt.createPortalToken;
  novo = (await import("../lib/exam-link")).criarTokenExame;
  app = express(); app.use(express.json());
  app.use((req: any, _r, n) => { req.log = { error() {}, warn() {}, info() {} }; n(); });
  app.use("/api", (await import("../routes/exam-requests")).default);
  app.use("/api", (await import("../routes/exam-links-gestao")).default);
  app.use("/api", (await import("../routes/area-paciente")).default);
}, 90_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });
const H = (id: number) => ({ Authorization: `Bearer ${patientTok(id)}` });
const abrir = (t: string) => request(app).get(`/api/exam-requests/file/${t}`);

describe("política desligada (padrão): nada vence", () => {
  it("legado com data, sem data e link novo abrem", async () => {
    expect((await abrir(LEG1)).status).toBe(200);
    expect((await abrir(LEG_SEM_DATA)).status).toBe(200);
    expect((await abrir(novo({ pdfId: 1, clientId: 1 }))).status).toBe(200);
  });
});

describe("link novo no banco", () => {
  it("outra pessoa: token do cliente 2 apontando para documento do cliente 1 é recusado", async () => {
    expect((await abrir(novo({ pdfId: 1, clientId: 2 }))).status).toBe(400);
  });
  it("expirado 410; adulterado 400; revogado 410 (também no legado)", async () => {
    expect((await abrir(novo({ pdfId: 1, clientId: 1, agora: Date.now() - 31 * 86_400_000 }))).status).toBe(410);
    const t = novo({ pdfId: 1, clientId: 1 });
    expect((await abrir(t.slice(0, -3) + "xyz")).status).toBe(400);
    await pool.query(`UPDATE exam_request_pdfs SET revogado_em = now() WHERE id = 2`);
    expect((await abrir(novo({ pdfId: 2, clientId: 2 }))).status).toBe(410);
    expect((await abrir(LEG2)).status).toBe(410);
    expect((await abrir(LEG1)).status).toBe(200); // outro documento segue valendo
  });
  it("recusas não devolvem o token no corpo", async () => {
    const t = novo({ pdfId: 1, clientId: 2 });
    const r = await abrir(t);
    expect(JSON.stringify(r.body)).not.toContain(t);
  });
});

describe("paciente autenticado", () => {
  it("lista só os próprios documentos, sem token nem PDF; 401 sem sessão", async () => {
    expect((await request(app).get("/api/area-paciente/exames/documentos")).status).toBe(401);
    const r = await request(app).get("/api/area-paciente/exames/documentos").set(H(1));
    expect(r.status).toBe(200);
    expect(r.body.documentos.map((d: any) => d.fileName).sort()).toEqual(["a.pdf", "sem-data.pdf"]);
    expect(JSON.stringify(r.body)).not.toMatch(/token|pdf_data|JVBER/i);
    expect((await request(app).get("/api/area-paciente/exames/documentos").set(H(3))).body.documentos).toEqual([]);
  });
  it("reemite acesso novo só do próprio documento; de outro paciente 404; revogado 403", async () => {
    const ok = await request(app).post("/api/area-paciente/exames/documentos/1/acesso").set(H(1));
    expect(ok.status).toBe(200); expect(ok.body.url).toMatch(/\/api\/exam-requests\/file\/v1\./);
    expect((await request(app).get(ok.body.url)).status).toBe(200);
    expect((await request(app).post("/api/area-paciente/exames/documentos/1/acesso").set(H(2))).status).toBe(404);
    expect((await request(app).post("/api/area-paciente/exames/documentos/2/acesso").set(H(2))).status).toBe(403);
    expect((await request(app).post("/api/area-paciente/exames/documentos/1/acesso")).status).toBe(401);
  });
});

describe("transição dos legados (90 dias contados da ativação)", () => {
  it("só o dono ativa; exige confirmação; ativa uma única vez com data auditável", async () => {
    ctx.owner = false;
    expect((await request(app).post("/api/exam-requests/politica-legado/ativar").send({ confirmar: "ATIVAR_POLITICA_LEGADO" })).status).toBe(403);
    ctx.owner = true;
    expect((await request(app).post("/api/exam-requests/politica-legado/ativar").send({})).status).toBe(400);
    const a = await request(app).post("/api/exam-requests/politica-legado/ativar").send({ confirmar: "ATIVAR_POLITICA_LEGADO" });
    expect(a.status).toBe(201); expect(a.body.status.estado).toBe("em_transicao");
    const data = a.body.politica.ativadaEm;
    const b = await request(app).post("/api/exam-requests/politica-legado/ativar").send({ confirmar: "ATIVAR_POLITICA_LEGADO" });
    expect(b.status).toBe(409); expect(b.body.politica.ativadaEm).toBe(data); // data original preservada
  });
  it("dentro do prazo todos os legados (inclusive sem data de criação) seguem abrindo", async () => {
    expect((await abrir(LEG1)).status).toBe(200);
    expect((await abrir(LEG_SEM_DATA)).status).toBe(200);
  });
  it("passados 90 dias da ativação, legado vence (410) e link novo continua válido", async () => {
    await pool.query(`UPDATE app_settings SET value = jsonb_set(value::jsonb, '{ativadaEm}', to_jsonb((now() - interval '91 days')::text))::text WHERE key='exame.link.legado.politica'`);
    expect((await abrir(LEG1)).status).toBe(410);
    expect((await abrir(LEG_SEM_DATA)).status).toBe(410);
    expect((await abrir(novo({ pdfId: 1, clientId: 1 }))).status).toBe(200);
    const re = await request(app).post("/api/area-paciente/exames/documentos/3/acesso").set(H(1)); // reemissão recupera o acesso
    expect(re.status).toBe(200); expect((await request(app).get(re.body.url)).status).toBe(200);
  });
  it("registro ilegível não vence ninguém", async () => {
    await pool.query(`UPDATE app_settings SET value='lixo' WHERE key='exame.link.legado.politica'`);
    expect((await abrir(LEG1)).status).toBe(200);
  });
});

describe("lista do aplicativo do cliente (/area-paciente/exames)", () => {
  it("devolve acesso novo de 1 dia (nunca o código legado) e o link abre; sobrevive à transição dos legados", async () => {
    await pool.query(`UPDATE app_settings SET value = jsonb_build_object('ativadaEm', (now() - interval '91 days')::text, 'dias', 90, 'ativadaPor','t')::text WHERE key='exame.link.legado.politica'`);
    const r = await request(app).get("/api/area-paciente/exames").set(H(1));
    expect(r.status).toBe(200);
    const toks: string[] = r.body.map((e: any) => e.token);
    expect(toks.length).toBe(2);
    for (const t of toks) { expect(t.startsWith("v1.")).toBe(true); expect([LEG1, LEG_SEM_DATA]).not.toContain(t); expect((await abrir(t)).status).toBe(200); }
    expect((await abrir(LEG1)).status).toBe(410);
    expect((await request(app).get("/api/area-paciente/exames")).status).toBe(401);
  });
});

describe("tokens fora dos logs", () => {
  it("redigirTexto mascara o código do link na URL, legado e novo", async () => {
    const { redigirTexto, caminhoSeguroParaLog } = await import("../lib/redact");
    for (const t of [LEG1, novo({ pdfId: 1, clientId: 1 })]) {
      const linha = `GET /api/exam-requests/file/${t} 200`;
      expect(redigirTexto(linha)).not.toContain(t);
      expect(caminhoSeguroParaLog(`/api/exam-requests/file/${t}?x=1`)).not.toContain(t);
    }
  });
});

describe("segurança de exames: cabeçalho e isolamento entre empresas na revogação", () => {
  it("visualização (aceita ou recusada) sempre manda Referrer-Policy: no-referrer", async () => {
    // documento novo e token novo: independe do estado da política de legados dos testes anteriores
    const doc = (await pool.query(`INSERT INTO exam_request_pdfs (token, client_id, file_name, pdf_data, created_at) VALUES ($1,1,'h.pdf',$2,now()) RETURNING id`, ["e5".repeat(24), PDF])).rows[0].id;
    const tok = novo({ pdfId: doc, clientId: 1 });
    const ok = await abrir(tok);
    expect(ok.status).toBe(200);
    expect(ok.headers["referrer-policy"]).toBe("no-referrer");
    const ruim = await abrir("lixo");
    expect(ruim.status).toBe(400);
    expect(ruim.headers["referrer-policy"]).toBe("no-referrer");
    const arq = await request(app).get("/api/exam-requests/arquivo").set("X-Link-Token", tok);
    expect(arq.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("clínica A não revoga documento de cliente da clínica B (404) e o documento segue abrindo", async () => {
    const TOK_C = "d4".repeat(24);
    const ins = await pool.query(`INSERT INTO exam_request_pdfs (token, client_id, file_name, pdf_data, created_at) VALUES ($1,3,'c.pdf',$2,'2026-06-16') RETURNING id`, [TOK_C, PDF]);
    const idC = ins.rows[0].id;
    ctx.empresa = 1;
    expect((await request(app).post(`/api/exam-requests/${idC}/revogar`)).status).toBe(404);
    expect((await pool.query(`SELECT revogado_em FROM exam_request_pdfs WHERE id=$1`, [idC])).rows[0].revogado_em).toBeNull();
    const tokC = novo({ pdfId: idC, clientId: 3 });
    expect((await abrir(tokC)).status).toBe(200);
    ctx.empresa = 2;
    expect((await request(app).post(`/api/exam-requests/${idC}/revogar`)).status).toBe(200);
    expect((await abrir(tokC)).status).toBe(410);
    ctx.empresa = 1;
  });
});
