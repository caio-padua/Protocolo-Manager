/**
 * SERVIDOR COMPLETO, duas clínicas (A=5 e B=6), dois médicos e dois clientes sintéticos, PostgreSQL descartável.
 * Logins reais emitem os tokens. Prova: nenhum médico nem cliente de uma clínica lê ou altera dado da outra.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { subirServidorCompleto } from "./helpers/servidor-completo";

vi.mock("../lib/sheets-dicionario", () => ({ sincronizarDicionarioSheets: vi.fn(async () => ({})) }));
vi.mock("../lib/seed-avatares", () => ({ runSeedAvatares: vi.fn(async () => ({})) }));

let s: Awaited<ReturnType<typeof subirServidorCompleto>>;
let medA = "", medB = "", pacA = "", pacB = "", cofreA = 0, cofreB = 0, convA = 0;
const SENHA_C = "Senha-Teste-9a!", SENHA_P = "Paciente-Teste-9a!";
const CPF_A = "52998224725", CPF_B = "11144477735";
const req = (m: "get" | "post" | "patch" | "put" | "delete", url: string, token?: string, body?: object, headers: Record<string, string> = {}) => {
  const r = request(s.app)[m](url); if (token) r.set("Authorization", `Bearer ${token}`);
  for (const [k, v] of Object.entries(headers)) r.set(k, v);
  return body ? r.send(body) : r;
};
const loginColab = async (email: string) => {
  const r = await req("post", "/api/collaborator/login", undefined, { identifier: email, password: SENHA_C });
  if (r.status !== 200) throw new Error(`login ${email} ${r.status}`); return r.body.token as string;
};
const loginPac = async (cpf: string) => {
  const r = await req("post", "/api/area-paciente/login", undefined, { cpf, password: SENHA_P });
  if (r.status !== 200 || !r.body.token) throw new Error(`login paciente ${r.status}`); return r.body.token as string;
};

beforeAll(async () => {
  s = await subirServidorCompleto();
  const { ensureClienteMedicacoes } = await import("../lib/ensure-cliente-medicacoes.js");
  await ensureClienteMedicacoes();
  await (await import("../lib/ensure-paxcare.js")).ensurePaxcareTables();
  const { hashPassword } = await import("../lib/collaborator-auth.js");
  const { hashPassword: hashPac } = await import("../lib/patient-auth");
  await s.pool.query(`INSERT INTO empresas (id, nome, ativa, status, tipo) VALUES (5,'Clinica A Sintetica',true,'ATIVO','clinic'),(6,'Clinica B Sintetica',true,'ATIVO','clinic')`);
  await s.pool.query(`INSERT INTO professionals (id,name,email,password_hash,registration_number,empresa_id) VALUES
    (11,'Medica A','medica-a@teste.com',$1,'111111',5),(12,'Medico B','medico-b@teste.com',$1,'222222',6)`, [hashPassword(SENHA_C)]);
  await s.pool.query(`INSERT INTO clients (id,name,cpf,password_hash,must_change_password,empresa_id) VALUES
    (21,'Cliente A Sintetica','${CPF_A}',$1,false,5),(22,'Cliente B Sintetica','${CPF_B}',$1,false,6)`, [hashPac(SENHA_P)]);
  await s.pool.query(`INSERT INTO paxcare_cofre_itens (client_id,tipo,titulo,notas) VALUES (21,'historico','Cofre da A','segredo A'),(22,'historico','Cofre da B','segredo B')`);
  cofreA = (await s.pool.query(`SELECT id FROM paxcare_cofre_itens WHERE client_id=21`)).rows[0].id;
  cofreB = (await s.pool.query(`SELECT id FROM paxcare_cofre_itens WHERE client_id=22`)).rows[0].id;
  medA = await loginColab("medica-a@teste.com"); medB = await loginColab("medico-b@teste.com");
  pacA = await loginPac(CPF_A); pacB = await loginPac(CPF_B);
}, 400_000);
afterAll(async () => { await s?.parar(); });

describe("médicos: cada clínica vê só os próprios clientes", () => {
  it("lista de clientes", async () => {
    const a = await req("get", "/api/clients", medA); const b = await req("get", "/api/clients", medB);
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(a.body.map((c: any) => c.id)).toEqual([21]); expect(b.body.map((c: any) => c.id)).toEqual([22]);
    expect(JSON.stringify(a.body)).not.toContain("Cliente B"); expect(JSON.stringify(b.body)).not.toContain("Cliente A");
  });
  it("busca por nome ou CPF do cliente da outra clínica não acha nada", async () => {
    expect((await req("get", `/api/clients?search=${CPF_B}`, medA)).body).toEqual([]);
    expect((await req("get", "/api/clients?search=Cliente%20A", medB)).body).toEqual([]);
  });
  it("ficha, comunicação e canal do cliente de outra clínica: 404, nunca 200", async () => {
    for (const [tok, outro] of [[medA, 22], [medB, 21]] as const) {
      for (const u of [`/api/clients/${outro}`, `/api/clients/${outro}/comunicacao`, `/api/clients/${outro}/canal-clinica`, `/api/clients/${outro}/redes-sociais`]) {
        const r = await req("get", u, tok);
        expect([403, 404], `${u} -> ${r.status}`).toContain(r.status);
      }
    }
    expect((await req("get", "/api/clients/21", medA)).status).toBe(200);
    expect((await req("get", "/api/clients/22", medB)).status).toBe(200);
  });
  it("alterar ou apagar cliente da outra clínica não tem efeito", async () => {
    const antes = (await s.pool.query(`SELECT name,status,deleted_at FROM clients WHERE id=22`)).rows[0];
    await req("put", "/api/clients/22", medA, { name: "INVADIDO" });
    await req("patch", "/api/clients/22", medA, { name: "INVADIDO" });
    await req("post", "/api/clients/bulk", medA, { ids: [22], action: "delete" });
    const depois = (await s.pool.query(`SELECT name,status,deleted_at FROM clients WHERE id=22`)).rows[0];
    expect(depois).toEqual(antes);
  });
  it("selecionar a clínica da outra por cabeçalho ou parâmetro não concede acesso", async () => {
    const h = await req("get", "/api/clients", medA, undefined, { "x-empresa-id": "6" });
    expect(h.status === 200 ? h.body.map((c: any) => c.id) : []).not.toContain(22);
    expect(h.status).toBeGreaterThanOrEqual(200);
    const q = await req("get", "/api/clients?empresaId=6", medA);
    expect(q.status === 200 ? q.body.map((c: any) => c.id) : []).not.toContain(22);
    expect([403, 200]).toContain(q.status);
    if (h.status === 200) expect(h.body.map((c: any) => c.id)).toEqual([21]);
  });
  it("guia digital: lista de clientes da clínica do próprio médico", async () => {
    expect((await req("get", "/api/onboarding/clientes", medA)).body.map((c: any) => c.id)).toEqual([21]);
    expect((await req("get", "/api/onboarding/clientes", medB)).body.map((c: any) => c.id)).toEqual([22]);
  });
  it("sem token: 401", async () => {
    expect((await req("get", "/api/clients")).status).toBe(401);
    expect((await req("get", "/api/clients/21")).status).toBe(401);
  });
});

describe("clientes: cada um só vê e altera o que é seu", () => {
  it("cofre: lista própria; item alheio não abre nem se apaga", async () => {
    const a = await req("get", "/api/area-paciente/paxcare/cofre", pacA);
    expect(a.status).toBe(200); expect(a.body.itens.map((i: any) => i.titulo)).toEqual(["Cofre da A"]);
    expect(a.body.clinicaOrigem.id).toBe(5);
    expect(JSON.stringify(a.body)).not.toContain("segredo B");
    const b = await req("get", "/api/area-paciente/paxcare/cofre", pacB);
    expect(b.body.itens.map((i: any) => i.titulo)).toEqual(["Cofre da B"]); expect(b.body.clinicaOrigem.id).toBe(6);
    expect((await req("get", `/api/area-paciente/paxcare/cofre/${cofreB}/arquivo`, pacA)).status).toBe(404);
    expect((await req("delete", `/api/area-paciente/paxcare/cofre/${cofreB}`, pacA)).status).toBe(404);
    expect((await s.pool.query(`SELECT removido_em FROM paxcare_cofre_itens WHERE id=$1`, [cofreB])).rows[0].removido_em).toBeNull();
    expect(cofreA).toBeGreaterThan(0);
  });
  it("convite a médico: o cliente B não revoga o convite do cliente A", async () => {
    const termo = (await req("get", "/api/area-paciente/paxcare/convites-medico/termo", pacA)).body;
    const c = await req("post", "/api/area-paciente/paxcare/convites-medico", pacA, { consentimentoHash: termo.hash, medicoNome: "Medica A", medicoEmail: "medica-a@teste.com", conselho: "111111", uf: "SP", compartilha: { historico: true, exames: false, documentos: false } });
    expect(c.status).toBe(201); convA = c.body.id ?? (await s.pool.query(`SELECT id FROM paxcare_convites_medico WHERE client_id=21`)).rows[0].id;
    expect((await req("delete", `/api/area-paciente/paxcare/convites-medico/${convA}`, pacB)).status).toBe(404);
    expect((await req("get", "/api/area-paciente/paxcare/convites-medico", pacB)).body).toEqual([]);
    expect((await s.pool.query(`SELECT status FROM paxcare_convites_medico WHERE id=$1`, [convA])).rows[0].status).toBe("pendente");
    // o médico B (outra clínica e outro e-mail/CRM) não abre o convite endereçado à médica A
    expect((await req("get", `/api/collaborator/paxcare/convites/${c.body.token}`, medB)).status).toBe(403);
    expect((await req("get", `/api/collaborator/paxcare/convites/${c.body.token}`, medA)).status).toBe(200);
  });
  it("credenciais não se trocam: cliente não usa rota de médico e médico não usa rota de cliente", async () => {
    expect((await req("get", "/api/clients", pacA)).status).toBe(401);
    expect((await req("get", "/api/area-paciente/paxcare/cofre", medA)).status).toBe(401);
    expect((await req("get", "/api/ceo/acolhimento", medA)).status).toBe(403);
    expect((await req("get", "/api/ceo/acolhimento", pacA)).status).toBe(401);
  });
  it("sem token: 401 nas rotas do cliente", async () => {
    expect((await req("get", "/api/area-paciente/paxcare/cofre")).status).toBe(401);
    expect((await req("get", "/api/area-paciente/paxcare/cofre/1/arquivo")).status).toBe(401);
  });
});
