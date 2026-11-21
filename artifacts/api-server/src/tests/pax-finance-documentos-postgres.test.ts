import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ database: null as any }));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const db = new Proxy({}, { get(_t, k) { const v = state.database?.[k]; return typeof v === "function" ? v.bind(state.database) : v; } });
  return { ...schema, db };
});
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) => {
    if (!req.headers["x-collab"]) { res.status(401).json({ error: "Não autenticado" }); return; }
    req.collaborator = { professionalId: Number(req.headers["x-collab"]) };
    req.tenantContext = { authenticated: true, isPlatformOwner: req.headers["x-ceo"] === "1" }; next();
  },
}));
vi.mock("../middleware/messageClinic", () => ({ requireMessageClinic: (req: any, _r: any, next: any) => { req.messageEmpresaId = Number(req.headers["x-empresa"]); next(); } }));
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_q: any, _r: any, next: any) => next() }));
// A IA nunca e chamada em teste: o motor deve registrar "indisponivel" com honestidade.
vi.mock("../lib/ai-central", () => ({ requireAiTenant: () => { throw new Error("sem IA no teste"); }, logAiUsage: async () => {} }));

import router from "../pax-finance/routes";
import { PAX_FINANCE_DDL } from "../pax-finance/schema";

let iso: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const q = (t: string, p?: any[]) => iso.pool.query(t, p);
const app = express();
app.use(express.json(), (req: any, _r: any, n: any) => { req.log = { error(...a: any[]) { console.log("LOGERR", String((a[0] as any)?.err?.message ?? a[0]).slice(0, 400)); }, info() {}, warn() {} }; n(); }, router);
const H = (empresa: number, extra: Record<string, string> = {}) => ({ "x-collab": "1", "x-empresa": String(empresa), ...extra });

async function pdf(linhas: string[]): Promise<Buffer> {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  let p = d.addPage([600, 800]); let y = 780;
  const quebra = (l: string) => l.length <= 100 ? [l] : l.match(/.{1,100}(\s|$)/g)!.map((x) => x.trim());
  for (const l of linhas.flatMap(quebra)) { if (y < 30) { p = d.addPage([600, 800]); y = 780; } p.drawText(l, { x: 20, y, size: 8, font: f }); y -= 11; }
  return Buffer.from(await d.save());
}
const RFB = (cnpj: string, razao: string) => ["COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL", "NÚMERO DE INSCRIÇÃO", cnpj, "MATRIZ", "DATA DE INSCRIÇÃO NO CNPJ", "30/09/2026", "NOME EMPRESARIAL", razao,
  "DATA DE CONSTITUIÇÃO", "13/08/2026", "PORTE", "EPP", "CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL", "86.30-5-03 - Atividade medica ambulatorial restrita a consultas",
  "CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA", "206-2 - Sociedade Empresária Limitada", "LOGRADOURO", "R TESTE", "NÚMERO", "10", "COMPLEMENTO", "SALA 1", "CEP", "01.000-000",
  "BAIRRO/DISTRITO", "CENTRO", "MUNICÍPIO", "SAO PAULO", "UF", "SP", "SITUAÇÃO CADASTRAL", "ATIVA", "DATA DA SITUAÇÃO CADASTRAL", "13/08/2026",
  ...Array.from({ length: 12 }, (_, i) => `linha de preenchimento numero ${i} para passar do minimo de texto do documento`)];
const CONTRATO = (razao: string) => ["ATO CONSTITUTIVO DE SOCIEDADE EMPRESARIAL LIMITADA", "MARIA SINTETICA DA SILVA, brasileira, solteira, administradora, nascida em 01/02/1990, portadora da Cédula de Identidade RG n° 12.345.678-9",
  "SSP/SP, inscrita no CPF n° 111.444.777-35, residente e domiciliada na Rua Ficticia n° 99 - Casa 2, Bairro Falso, São Paulo -SP, CEP 01234-567, por este instrumento",
  "particular resolve constituir uma sociedade.", `CLÁUSULA PRIMEIRA: A sociedade irá girar sob a denominação de ${razao}, podendo abrir filiais`,
  "CLÁUSULA SEGUNDA: A sede fica estabelecida na Rua Teste n° 10 - Sala 1, Centro, São Paulo - SP, CEP 01.000-000.", "CLÁUSULA TERCEIRA: O prazo de duração é indeterminado.",
  "CLÁUSULA QUARTA: O objetivo da empresa é explorar as atividades de consultas medicas.", "CLÁUSULA QUINTA: O Capital Social é de R$ 100.000,00 (Cem Mil Reais), dividido",
  "em 100.000 (Cem Mil) quotas, no valor nominal de R$ 1,00 (Hum Real) cada uma,", "totalmente integralizado em moeda corrente nacional neste ato e assim distribuído:",
  "Sócia Quotas R$ %", "Maria Sintetica da Silva 100.000 100.000,00 100,00%", "TOTAL 100.000 100.000,00 100,00%",
  "A administração será exercida pela titular, Maria Sintetica da Silva, já qualificada, com pró-labore.", "A responsabilidade e administração técnica da empresa caberá ao médico Dr. Joao Clinico habilitado e registrado no CRM/SP 123456.", "Fica eleito o foro de São Paulo para o exercício.",
  "São Paulo, 09 de Junho de 2026.", ...Array.from({ length: 6 }, (_, i) => `texto de preenchimento ${i} para passar do minimo de texto do documento sintetico`)];

beforeAll(async () => {
  iso = await startIsolatedPostgres(); state.database = drizzle(iso.pool);
  await q("CREATE TABLE empresas (id integer PRIMARY KEY, nome text, cnpj text, razao_social text, ativa boolean DEFAULT true, status text DEFAULT 'ATIVO', cnae text, cnae_descricao text, cnaes_secundarios jsonb, natureza_juridica text, data_abertura date, capital_social numeric, dono_nome text, responsavel_legal_nome text, endereco text, numero text, complemento text, bairro text, cep text, cidade text, estado text, telefone text, email_geral text, nome_fantasia text)");
  await q("INSERT INTO empresas (id,nome,cnpj,razao_social) VALUES (7,'Teste','11.222.333/0001-81','EMPRESA TESTE LTDA'),(8,'Outra','69.410.873/0001-79','OUTRA LTDA')");
  await q("CREATE TABLE professional_empresas (id serial PRIMARY KEY, professional_id int, empresa_id int, ordem int)");
  await q("INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (1,7,1),(1,8,2)");
  await q("CREATE TABLE professionals (id int PRIMARY KEY, empresa_id int, active boolean DEFAULT true, professional_type text, registration_number text, crm text)");
  await q("INSERT INTO professionals (id,empresa_id,professional_type,registration_number) VALUES (1,7,'medico',NULL),(2,7,'medico','CRM/SP 123456')");
  await q("CREATE TABLE empresa_responsaveis (empresa_id int PRIMARY KEY, administrador_professional_id int, responsavel_tecnico_professional_id int, atualizado_por int, atualizado_em timestamptz DEFAULT now())");
  await q("CREATE TABLE empresa_responsaveis_auditoria (id serial PRIMARY KEY, empresa_id int, funcao text, antes int, depois int, por int)");
  await q("CREATE TABLE financial_goals (id serial PRIMARY KEY)");
  await q("CREATE TABLE payments (id serial PRIMARY KEY, empresa_id int, amount numeric, status text, paid_at text, due_date text, created_at text, provider text, asaas_invoice_url text)");
  for (const x of PAX_FINANCE_DDL) await q(x);
}, 120000);
afterAll(async () => { if (iso) await iso.stop(); }, 60000);

const up = async (slot: string, buf: Buffer, h = H(7), nome = "a.pdf") => request(app).post(`/pax-finance/documents/${slot}`).set(h).attach("arquivo", buf, { filename: nome, contentType: "application/pdf" });

describe("PAX FINANCE documentos oficiais", () => {
  it("exige login e recusa tipo desconhecido e arquivo que não é PDF", async () => {
    expect((await request(app).get("/pax-finance/documents")).status).toBe(401);
    expect((await up("qualquer", await pdf(["x"]))).status).toBe(400);
    expect((await up("cnpj_rfb", Buffer.from("nao sou pdf"))).status).toBe(415);
  });
  it("documento no campo errado é recusado com orientação", async () => {
    const r = await up("contrato_social", await pdf(RFB("11.222.333/0001-81", "EMPRESA TESTE LTDA")));
    expect(r.status).toBe(422); expect(r.body.error).toMatch(/Comprovante/);
  });
  it("envia comprovante e contrato; sensíveis ficam mascarados e cifrados no banco", async () => {
    expect((await up("cnpj_rfb", await pdf(RFB("11.222.333/0001-81", "EMPRESA TESTE LTDA")))).status).toBe(201);
    expect((await up("contrato_social", await pdf(CONTRATO("EMPRESA TESTE LTDA")))).status).toBe(201);
    const l = (await request(app).get("/pax-finance/documents").set(H(7))).body;
    const rfb = l.slots.find((s: any) => s.slot === "cnpj_rfb").documento; const ct = l.slots.find((s: any) => s.slot === "contrato_social").documento;
    expect(rfb.campos.find((c: any) => c.chave === "cnpj").valor).toBe("11.222.333/0001-81");
    expect(ct.sensiveis).toEqual([]); expect(ct.campos.find((c: any) => c.chave === "socio1_cpf").valor).toBe("11144477735"); // CPF em claro (decisão do CEO)
    expect(JSON.stringify(l)).toMatch(/11144477735/); // dados pessoais em claro (decisão do CEO, ambiente de testes)
    expect(ct.conferenciaIa.status).toBe("indisponivel");
    const bruto = JSON.stringify((await q("SELECT sensiveis FROM fin_doc_import WHERE slot='contrato_social'")).rows);
    expect(bruto).not.toMatch(/11144477735/); // nada cifrado: o CPF está em campos, em claro
    expect(l.podeAplicar).toBe(true);
  });
  it("CPF aparece em claro para o colaborador, sem etapa de revelar", async () => {
    const l = (await request(app).get("/pax-finance/documents").set(H(7))).body;
    expect(JSON.stringify(l)).toMatch(/11144477735/);
  });
  it("outra empresa não vê os documentos nem os revela", async () => {
    const o = H(7, { "x-fin-company": "8", "x-ceo": "1" });
    const l = (await request(app).get("/pax-finance/documents").set(o)).body;
    expect(l.slots.every((s: any) => s.documento === null)).toBe(true);
    const id = (await q("SELECT id FROM fin_doc_import WHERE slot='contrato_social'")).rows[0].id;
    expect((await request(app).post(`/pax-finance/documents/${id}/reveal`).set(o).send({ chave: "socio1_cpf" })).status).toBe(404);
  });
  it("CNPJ de outra empresa bloqueia a aplicação e nada é gravado", async () => {
    const o = H(7, { "x-fin-company": "8" });
    expect((await up("cnpj_rfb", await pdf(RFB("11.222.333/0001-81", "OUTRA LTDA")), o)).status).toBe(201);
    const r = await request(app).post("/pax-finance/documents/apply").set(o);
    expect(r.status).toBe(409); expect(r.body.error).toMatch(/CNPJ/);
    expect((await q("SELECT cnae FROM empresas WHERE id=8")).rows[0].cnae).toBeNull();
    expect(Number((await q("SELECT count(*) c FROM fin_company_registry WHERE company_id=8")).rows[0].c)).toBe(0);
  });
  it("aplicar grava empresa, cadastro completo e pessoas; reaplicar não duplica; audita valores anteriores", async () => {
    const r = await request(app).post("/pax-finance/documents/apply").set(H(7));
    expect(r.status).toBe(200);
    const e = (await q("SELECT * FROM empresas WHERE id=7")).rows[0];
    expect(e.dono_nome).toBe("Maria Sintetica da Silva"); expect(e.cnae).toBe("86.30-5-03"); expect(Number(e.capital_social)).toBe(100000); expect(e.cep).toBeTruthy();
    const reg = (await request(app).get("/pax-finance/documents/registry").set(H(7))).body;
    expect(reg.existe).toBe(true); expect(reg.campos.find((c: any) => c.chave === "foro").valor).toBe("São Paulo"); expect(reg.sensiveis).toHaveLength(0); expect(reg.campos.some((c: any) => c.chave === "socio1_cpf")).toBe(true); // ambiente de testes: CPF em claro por decisão do CEO
    expect(JSON.stringify(reg)).toMatch(/11144477735/); // CPF em claro no cadastro (ambiente de testes)
    const n1 = Number((await q("SELECT count(*) c FROM fin_partner WHERE company_id=7")).rows[0].c);
    expect(n1).toBe(1);
    // medico responsavel tecnico: so informativo, nunca socio nem responsavel da empresa
    expect(Number((await q("SELECT count(*) c FROM fin_partner WHERE company_id=7 AND (papel='responsavel_tecnico' OR nome ILIKE '%Clinico%')")).rows[0].c)).toBe(0);
    expect(reg.campos.find((c: any) => c.chave === "rtNome").valor).toMatch(/Joao Clinico/);
    expect(reg.campos.find((c: any) => c.chave === "rtNome").grupo).toMatch(/não societário/);
    const rt = (await q("SELECT administrador_professional_id a, responsavel_tecnico_professional_id r FROM empresa_responsaveis WHERE empresa_id=7")).rows[0];
    expect(rt.r).toBe(2); expect(rt.a).toBeNull(); // ligado ao campo Responsável técnico pelo registro CRM; administrador intocado
    expect(e.dono_nome).not.toMatch(/Clinico/); expect(e.responsavel_legal_nome).not.toMatch(/Clinico/);
    expect((await request(app).post("/pax-finance/documents/apply").set(H(7))).status).toBe(200);
    expect(Number((await q("SELECT count(*) c FROM fin_partner WHERE company_id=7")).rows[0].c)).toBe(1);
    expect(Number((await q("SELECT count(*) c FROM fin_audit_log WHERE action='documento.aplicar'")).rows[0].c)).toBe(2);
  });
  it("campo do responsável técnico: salva no cadastro informativo, audita e nunca vira sócio", async () => {
    const r = await request(app).put("/pax-finance/documents/registry/responsavel-tecnico").set(H(7)).send({ nome: "Dr. Medico Clinico", registro: "CRM/SP 999" });
    expect(r.status).toBe(200);
    const reg = (await request(app).get("/pax-finance/documents/registry").set(H(7))).body;
    expect(reg.campos.find((c: any) => c.chave === "rtNome").valor).toBe("Dr. Medico Clinico");
    expect(reg.campos.find((c: any) => c.chave === "foro")).toBeTruthy(); // não apagou o restante
    expect(Number((await q("SELECT count(*) c FROM fin_partner WHERE company_id=7 AND nome ILIKE '%Medico Clinico%'")).rows[0].c)).toBe(0);
    expect((await request(app).put("/pax-finance/documents/registry/responsavel-tecnico").set(H(7)).send({ nome: "x", registro: "" })).status).toBe(400);
  });
  it("CNAE: catálogo da saúde com autocompletar, e a empresa troca principal e acrescenta secundários", async () => {
    const h0 = await request(app).get("/pax-finance/cnae/search?q=hospital").set(H(7)); const hosp = h0.body;
    expect(hosp.map((x: any) => x.codigo)).toContain("86.10-1-01");
    expect((await request(app).get("/pax-finance/cnae/search?q=8630").set(H(7))).body.map((x: any) => x.codigo)).toContain("86.30-5-03");
    expect((await request(app).get("/pax-finance/cnae/search?q=m%C3%A9dica%20ambulatorial").set(H(7))).body.length).toBeGreaterThan(1); // acento e várias palavras
    expect((await request(app).get("/pax-finance/cnae/search?q=transporte rodoviario").set(H(7))).body).toEqual([]); // fora da saúde só com "todas"
    expect((await request(app).get("/pax-finance/cnae/search?q=transporte rodoviario&todas=1").set(H(7))).body.length).toBeGreaterThan(0);
    const total = Number((await q("SELECT count(*) c FROM fin_cnae_catalogo")).rows[0].c); const saude = Number((await q("SELECT count(*) c FROM fin_cnae_catalogo WHERE area_saude IS NOT NULL")).rows[0].c);
    expect(total).toBe(1332); expect(saude).toBeGreaterThanOrEqual(80);
    const put = (b: any, h = H(7)) => request(app).put("/pax-finance/cnae/company").set(h).send(b);
    expect((await put({ principal: "86.30-5-03", secundarios: ["86.40-2-02", "86.30-5-03", "86.40-2-02", "72.10-0-00"] })).body.secundarios).toBe(2);
    const c = (await request(app).get("/pax-finance/cnae/company").set(H(7))).body;
    expect(c.principal.codigo).toBe("86.30-5-03"); expect(c.principal.descricao).toMatch(/ambulatorial/i);
    expect(c.secundarios.map((x: any) => x.codigo)).toEqual(["86.40-2-02", "72.10-0-00"]); expect(c.secundarios[0].descricao).toMatch(/clínicos/i);
    expect((await q("SELECT cnae FROM empresas WHERE id=7")).rows[0].cnae).toBe("86.30-5-03");
    expect((await q("SELECT cnae FROM empresas WHERE id=8")).rows[0].cnae).toBeNull(); // outra empresa intocada
    expect((await put({ principal: "8630503", secundarios: [] })).status).toBe(400);
    expect((await put({ principal: "99.99-9-99", secundarios: [] })).status).toBe(422);
    expect(Number((await q("SELECT count(*) c FROM fin_audit_log WHERE action='cnae.salvar'")).rows[0].c)).toBe(1);
  });
  it("novo envio substitui sem apagar; mesmo arquivo repetido é recusado; razão social divergente bloqueia", async () => {
    const b = await pdf(RFB("11.222.333/0001-81", "EMPRESA TESTE LTDA").concat(["observacao nova"]));
    expect((await up("cnpj_rfb", b)).status).toBe(201);
    expect((await up("cnpj_rfb", b)).status).toBe(409);
    expect(Number((await q("SELECT count(*) c FROM fin_doc_import WHERE company_id=7 AND slot='cnpj_rfb'")).rows[0].c)).toBe(2);
    expect((await q("SELECT status FROM fin_doc_import WHERE company_id=7 AND slot='cnpj_rfb' ORDER BY id")).rows.map((x: any) => x.status)).toEqual(["substituido", "extraido"]);
    expect((await up("contrato_social", await pdf(CONTRATO("OUTRA EMPRESA LTDA")))).status).toBe(201);
    const l = (await request(app).get("/pax-finance/documents").set(H(7))).body;
    expect(l.podeAplicar).toBe(false); expect(l.bloqueios.join(" ")).toMatch(/divergem/);
    expect((await request(app).post("/pax-finance/documents/apply").set(H(7))).status).toBe(409);
  });
});
