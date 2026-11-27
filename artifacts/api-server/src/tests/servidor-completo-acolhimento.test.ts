/**
 * SERVIDOR COMPLETO: app real (src/app.ts, com Basic Auth, CORS, limite de taxa, tenantContext, papéis, guardas e roteadores
 * reais) sobre PostgreSQL descartável com o esquema real. Logins reais emitem os tokens; nada é simulado na autenticação.
 * Canais externos ficam sem credencial. Serviços externos de boot (Google Sheets, seed de avatares) são substituídos.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { subirServidorCompleto } from "./helpers/servidor-completo";

vi.mock("../lib/sheets-dicionario", () => ({ sincronizarDicionarioSheets: vi.fn(async () => ({})) }));
vi.mock("../lib/seed-avatares", () => ({ runSeedAvatares: vi.fn(async () => ({})) }));

let s: Awaited<ReturnType<typeof subirServidorCompleto>>;
let titular = "", comum = "", medico = "", outroMedico = "", paciente = "";
const CPF = "52998224725";
const SENHA_C = "Senha-Teste-9a!";
const SENHA_P = "Paciente-Teste-9a!";
const get = (url: string, token?: string) => { const r = request(s.app).get(url); return token ? r.set("Authorization", `Bearer ${token}`) : r; };
const send = (m: "post" | "patch" | "delete", url: string, body: object | undefined, token?: string) => {
  const r = request(s.app)[m](url); if (token) r.set("Authorization", `Bearer ${token}`); return body ? r.send(body) : r;
};
async function loginColab(email: string): Promise<string> {
  const r = await send("post", "/api/collaborator/login", { identifier: email, password: SENHA_C });
  if (r.status !== 200) throw new Error("login " + email + " " + r.status + " " + JSON.stringify(r.body));
  return r.body.token;
}
const linhaAcesso = async (tipo: string, id: number) =>
  (await s.pool.query(`SELECT * FROM acesso_primeiro_registro WHERE tipo=$1 AND pessoa_id=$2`, [tipo, id])).rows[0];

beforeAll(async () => {
  s = await subirServidorCompleto();
  const { ensureClienteMedicacoes } = await import("../lib/ensure-cliente-medicacoes.js");
  await ensureClienteMedicacoes();
  const { hashPassword } = await import("../lib/collaborator-auth.js");
  const { hashPassword: hashPac } = await import("../lib/patient-auth");
  const h = hashPassword(SENHA_C);
  await s.pool.query(`INSERT INTO empresas (id, nome, ativa, status, tipo) VALUES (5, 'Clinica Sintetica', true, 'ATIVO', 'clinic')`);
  await s.pool.query(`INSERT INTO professionals (id,name,email,password_hash,is_platform_owner,registration_number,empresa_id) VALUES
    (1,'Titular Sintetico','titular@teste.com',$1,true,'111111',5),
    (2,'Comum Sintetico','comum@teste.com',$1,false,'222222',5),
    (3,'Dr Convidado','dr@teste.com',$1,false,'123456',5),
    (4,'Dra Outra','outra@teste.com',$1,false,'999999',5)`, [h]);
  await s.pool.query(`SELECT setval(pg_get_serial_sequence('professionals','id'), 10)`);
  await s.pool.query(`INSERT INTO clients (id,name,cpf,password_hash,must_change_password,empresa_id) VALUES
    (1,'Ana Sintetica','${CPF}',$1,false,5),
    (2,'Beto Sintetico','11144477735',$2,true,5)`, [hashPac(SENHA_P), hashPac("Provisoria-9a!")]);
  titular = await loginColab("titular@teste.com"); comum = await loginColab("comum@teste.com");
  medico = await loginColab("dr@teste.com"); outroMedico = await loginColab("outra@teste.com");
}, 400_000);
afterAll(async () => { await s?.parar(); });

describe("leads da vitrine (GET e PATCH) no servidor completo", () => {
  it("sem token: 401 nos dois", async () => {
    expect((await get("/api/vitrine-leads")).status).toBe(401);
    expect((await send("patch", "/api/vitrine-leads/1/contato", { contatado: true })).status).toBe(401);
  });
  it("token inválido: 401", async () => {
    expect((await get("/api/vitrine-leads", "lixo")).status).toBe(401);
  });
  it("não titular: 403 e nenhum dado", async () => {
    const g = await get("/api/vitrine-leads", comum);
    expect(g.status).toBe(403); expect(g.body.leads).toBeUndefined();
    expect((await send("patch", "/api/vitrine-leads/1/contato", { contatado: true }, comum)).status).toBe(403);
  });
  it("titular: 200 e altera contato; inexistente 404; id inválido 400", async () => {
    const g = await get("/api/vitrine-leads", titular);
    expect(g.status, JSON.stringify(g.body)).toBe(200); expect(Array.isArray(g.body.leads)).toBe(true);
    const ins = await s.pool.query(`INSERT INTO vitrine_leads (tipo, nome) VALUES ('paciente','Lead Sintetico') RETURNING id`).catch(async () =>
      s.pool.query(`SELECT id FROM vitrine_leads LIMIT 1`));
    if (ins.rows[0]) {
      const ok = await send("patch", `/api/vitrine-leads/${ins.rows[0].id}/contato`, { contatado: true, observacao: "teste" }, titular);
      expect(ok.status).toBe(200);
      expect((await s.pool.query(`SELECT contatado FROM vitrine_leads WHERE id=$1`, [ins.rows[0].id])).rows[0].contatado).toBe(true);
    }
    expect((await send("patch", "/api/vitrine-leads/999999/contato", { contatado: true }, titular)).status).toBe(404);
    expect((await send("patch", "/api/vitrine-leads/abc/contato", {}, titular)).status).toBe(400);
  });
});

describe("primeiro acesso: só login real conta", () => {
  it("login de colaborador registra primeiro e último acesso", async () => {
    const a = await linhaAcesso("profissional", 3);
    expect(a?.primeira_origem).toBe("login_colaborador");
    const antes = a.total; await loginColab("dr@teste.com");
    expect((await linhaAcesso("profissional", 3)).total).toBe(antes + 1);
    expect(String((await linhaAcesso("profissional", 3)).primeiro_em)).toBe(String(a.primeiro_em));
  });
  it("login errado não registra", async () => {
    await s.pool.query(`DELETE FROM acesso_primeiro_registro WHERE tipo='profissional' AND pessoa_id=4`);
    const r = await send("post", "/api/collaborator/login", { identifier: "outra@teste.com", password: "errada" });
    expect(r.status).toBe(401); expect(await linhaAcesso("profissional", 4)).toBeUndefined();
  });
  it("cliente: senha provisória não emite token nem registra; senha própria registra", async () => {
    const p = await send("post", "/api/area-paciente/login", { cpf: "11144477735", password: "Provisoria-9a!" });
    expect(p.status).toBe(200); expect(p.body.token).toBeUndefined(); expect(p.body.mustChangePassword).toBe(true);
    expect(await linhaAcesso("cliente", 2)).toBeUndefined();
    const l = await send("post", "/api/area-paciente/login", { cpf: CPF, password: SENHA_P });
    expect(l.status).toBe(200); paciente = l.body.token; expect(paciente).toBeTruthy();
    expect((await linhaAcesso("cliente", 1)).primeira_origem).toBe("login_senha");
  });
  it("navegação (evento de onboarding) não cria primeiro acesso", async () => {
    const ev = await send("post", "/api/onboarding/evento", { client_id: 2, secao: "login", device: "mobile" });
    expect(ev.status, JSON.stringify(ev.body)).toBeLessThan(300);
    expect((await s.pool.query(`SELECT 1 FROM onboarding_eventos WHERE client_id=2`)).rowCount).toBe(1);
    expect(await linhaAcesso("cliente", 2)).toBeUndefined();
  });
});

describe("central de acolhimento no servidor completo", () => {
  it("sem token 401; não titular 403; titular 200", async () => {
    for (const u of ["/api/ceo/acolhimento", "/api/ceo/acolhimento/modelos", "/api/ceo/acolhimento/historico?chave=cliente-1"]) {
      expect((await get(u)).status).toBe(401);
      expect((await get(u, comum)).status).toBe(403);
      expect((await get(u, titular)).status).toBe(200);
    }
  });
  it("pedido comercial e convite clínico ficam separados, cada um com o seu fluxo", async () => {
    const ped = await send("post", "/api/vitrine-convites", { nome: "Dr Convidado", email: "dr@teste.com", crm: "123456", uf: "SP", especialidade: "Endocrinologia", cidade: "Sao Paulo", consentimento: true });
    expect(ped.status).toBe(201);
    const semConsent = await send("post", "/api/vitrine-convites", { nome: "Dr Sem", email: "x@teste.com", crm: "123", uf: "SP", especialidade: "Clinica", cidade: "Sao Paulo" });
    expect(semConsent.status).toBe(400);

    const termo = (await get("/api/area-paciente/paxcare/convites-medico/termo", paciente)).body;
    const sem = await send("post", "/api/area-paciente/paxcare/convites-medico", { consentimentoHash: "x", medicoNome: "Dr Convidado", medicoEmail: "dr@teste.com", conselho: "123456", uf: "SP", compartilha: { historico: true, exames: false, documentos: false } }, paciente);
    expect(sem.status).toBe(400);
    const cri = await send("post", "/api/area-paciente/paxcare/convites-medico", { consentimentoHash: termo.hash, medicoNome: "Dr Convidado", medicoEmail: "dr@teste.com", conselho: "123456", uf: "SP", compartilha: { historico: true, exames: false, documentos: false } }, paciente);
    expect(cri.status).toBe(201);
    const tok = cri.body.token;
    expect((await get(`/api/collaborator/paxcare/convites/${tok}`, outroMedico)).status).toBe(403);
    expect((await get(`/api/collaborator/paxcare/convites/${tok}`, medico)).status).toBe(200);

    const lista = (await get("/api/ceo/acolhimento?tipo=medico", titular)).body;
    const pedido = lista.itens.find((i: any) => i.origem === "pedido_comercial");
    const conv = lista.itens.find((i: any) => i.origem === "convite_clinico");
    expect(pedido && conv).toBeTruthy();
    expect(pedido.pendencias).toContain("decidir_pedido");
    expect(conv.pendencias).toContain("aguardando_medico");
    expect(conv.contato).toContain("***");
    expect(conv.etapas.find((e: any) => e.codigo === "convite_aberto").estado).toBe("comprovado");
    expect(JSON.stringify(lista)).not.toContain(tok);

    const ace = await send("post", `/api/collaborator/paxcare/convites/${tok}/aceitar`, undefined, medico);
    expect(ace.status).toBe(200);
    const dep = (await get("/api/ceo/acolhimento?origem=convite_clinico", titular)).body.itens[0];
    expect(dep.etapas.find((e: any) => e.codigo === "resposta_medico").estado).toBe("comprovado");
    // aceite não é primeiro acesso: o primeiro acesso vem do login real do médico (registrado antes, no beforeAll)
    expect(dep.etapas.find((e: any) => e.codigo === "primeiro_acesso").fonte).toContain("login_colaborador");

    const h = (await get("/api/ceo/acolhimento/historico?chave=convite-" + conv.chave.split("-")[1], titular)).body;
    expect(h.eventos.map((e: any) => e.evento)).toEqual(expect.arrayContaining(["criou", "visualizou", "aceitou"]));
  });
  it("cliente: sem registro ≠ nunca acessou; provisória vira pendência; navegação rotulada", async () => {
    const itens = (await get("/api/ceo/acolhimento?tipo=cliente", titular)).body.itens;
    const ana = itens.find((i: any) => i.nome === "Ana Sintetica");
    const beto = itens.find((i: any) => i.nome === "Beto Sintetico");
    expect(ana.etapas.find((e: any) => e.codigo === "primeiro_acesso").estado).toBe("comprovado");
    expect(beto.etapas.find((e: any) => e.codigo === "primeiro_acesso").estado).toBe("sem_registro");
    expect(beto.etapas.find((e: any) => e.codigo === "primeiro_acesso").nota).toContain("não prova");
    expect(beto.pendencias).toEqual(expect.arrayContaining(["definir_senha", "sem_primeiro_acesso"]));
    expect(beto.etapas.find((e: any) => e.codigo === "navegacao").estado).toBe("comprovado");
    expect(beto.etapas.find((e: any) => e.codigo === "navegacao").nota).toContain("não prova o primeiro acesso");
  });
  it("filtros inválidos 400 e chave inválida 400; modelos sem envio", async () => {
    expect((await get("/api/ceo/acolhimento?tipo=x", titular)).status).toBe(400);
    expect((await get("/api/ceo/acolhimento?pendencia=x", titular)).status).toBe(400);
    expect((await get("/api/ceo/acolhimento/historico?chave=drop", titular)).status).toBe(400);
    const m = (await get("/api/ceo/acolhimento/modelos", titular)).body;
    expect(m.modelos.length).toBeGreaterThan(0); expect(m.aviso).toContain("Nada é enviado");
  });
});
