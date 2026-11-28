/**
 * SERVIDOR COMPLETO (app.ts real), duas clínicas A=5 e B=6, PostgreSQL descartável, dados sintéticos.
 * Amplia o isolamento A/B para AGENDA, EXAMES e MEDICAÇÕES: leituras, escritas, códigos de resposta e estado do banco.
 * Regra provada: o profissional ou o cliente de uma clínica nunca lê nem altera dado da outra; recusa = 403/404 e o banco não muda.
 * Os dois médicos recebem papéis completos na própria clínica: a recusa vem do isolamento, não da falta de papel.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { subirServidorCompleto } from "./helpers/servidor-completo";

vi.mock("../lib/sheets-dicionario", () => ({ sincronizarDicionarioSheets: vi.fn(async () => ({})) }));
vi.mock("../lib/seed-avatares", () => ({ runSeedAvatares: vi.fn(async () => ({})) }));

let s: Awaited<ReturnType<typeof subirServidorCompleto>>;
let medAcento = "", admA = "", admB = "", medA = "", medB = "", pacA = "", pacB = "";
let sessA = 0, sessB = 0, resA = 0, resB = 0, docA = 0, docB = 0, medicA = 0, medicB = 0;
const SENHA_C = "Senha-Teste-9a!", SENHA_P = "Paciente-Teste-9a!";
const CPF_A = "52998224725", CPF_B = "11144477735";
const req = (m: "get" | "post" | "patch" | "put" | "delete", url: string, token?: string, body?: object) => {
  const r = request(s.app)[m](url); if (token) r.set("Authorization", `Bearer ${token}`);
  return body ? r.send(body) : r;
};
const q = async (texto: string, p: unknown[] = []) => (await s.pool.query(texto, p)).rows;
const recusado = (st: number) => [403, 404].includes(st);
/** Recusa por isolamento: só 403/404 valem. 400 (corpo inválido), 401 e 5xx NUNCA contam como prova de isolamento. */
const exigirRecusa = (r: { status: number }, rotulo: string, permitidos: number[] = [403, 404]) =>
  expect(permitidos, `${rotulo}: recebeu ${r.status}`).toContain(r.status);

beforeAll(async () => {
  s = await subirServidorCompleto();
  await (await import("../lib/ensure-cliente-medicacoes.js")).ensureClienteMedicacoes();
  await (await import("../lib/ensure-paxcare.js")).ensurePaxcareTables();
  // Tabelas que o servidor real cria em tempo de execução (fora do drizzle); o banco descartável nasce sem elas.
  await (await import("../lib/ensure-exam-identity-schema.js")).ensureExamIdentitySchema();
  await (await import("../lib/agenda-integracao-schema.js")).ensureAgendaIntegrationSchema();
  await s.pool.query(`CREATE TABLE IF NOT EXISTS drive_watcher_files (file_id TEXT PRIMARY KEY, folder_id TEXT NOT NULL, folder_type TEXT NOT NULL, original_name TEXT NOT NULL, renamed_to TEXT, client_id INTEGER, client_name_raw TEXT, status TEXT NOT NULL DEFAULT 'pendente', error_msg TEXT, exam_document_id INTEGER, processed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), copied_drive_id TEXT, copied_name TEXT)`);
  const { hashPassword } = await import("../lib/collaborator-auth.js");
  const { hashPassword: hashPac } = await import("../lib/patient-auth");
  await s.pool.query(`INSERT INTO empresas (id,nome,ativa,status,tipo) VALUES (5,'Clinica A Sintetica',true,'ATIVO','clinic'),(6,'Clinica B Sintetica',true,'ATIVO','clinic')`);
  await s.pool.query(`INSERT INTO professionals (id,name,email,password_hash,registration_number,empresa_id,category) VALUES
    (11,'Medica A','medica-a@teste.com',$1,'111111',5,'medico'),(12,'Medico B','medico-b@teste.com',$1,'222222',6,'medico'),
    (15,'Medica Acento','medica-acento@teste.com',$1,'555555',5,'Médica'),
    (13,'Admin A','admin-a@teste.com',$1,'333333',5,'administrativo'),(14,'Admin B','admin-b@teste.com',$1,'444444',6,'administrativo')`, [hashPassword(SENHA_C)]);
  await s.pool.query(`INSERT INTO professional_papeis_empresa (professional_id,empresa_id,is_clinic_admin,is_doctor,is_nurse,is_reception) VALUES
    (11,5,true,true,true,true),(12,6,true,true,true,true),(15,5,false,true,false,false),(13,5,true,false,false,true),(14,6,true,false,false,true)`);
  await s.pool.query(`INSERT INTO clients (id,name,cpf,password_hash,must_change_password,empresa_id) VALUES
    (21,'Cliente A Sintetica','${CPF_A}',$1,false,5),(22,'Cliente B Sintetica','${CPF_B}',$1,false,6)`, [hashPac(SENHA_P)]);
  // Local de cada clínica + vínculo + concessão de administrador: sem isso a trava de gestão da agenda recusa até a própria clínica
  // e um 403 não distinguiria "outra clínica" de "sem permissão".
  await s.pool.query(`INSERT INTO locations (id,name,empresa_id,active) VALUES (501,'Local A',5,'true'),(502,'Local B',6,'true')`);
  await s.pool.query(`INSERT INTO location_professionals (location_id,professional_id) VALUES (501,11),(502,12),(501,13),(502,14)`);
  await s.pool.query(`INSERT INTO clinical_access_grants (empresa_id,location_id,professional_id,is_clinic_admin,updated_by_professional_id) VALUES (5,501,13,true,13),(6,502,14,true,14)`);
  // Agenda
  await s.pool.query(`INSERT INTO agenda_resources (id,name,kind,empresa_id,professional_id,location_id) VALUES (101,'Agenda A','enfermagem',5,11,501),(102,'Agenda B','enfermagem',6,12,502)`);
  await s.pool.query(`INSERT INTO agenda_windows (resource_id,weekday,start_time,end_time) VALUES (101,1,'08:00','12:00'),(102,1,'08:00','12:00')`);
  await s.pool.query(`INSERT INTO sessions (id,client_id,resource_id,scheduled_date,scheduled_time,empresa_id,notes) VALUES
    (201,21,101,'2027-03-01','09:00',5,'sessao A'),(202,22,102,'2027-03-01','09:00',6,'sessao B')`);
  sessA = 201; sessB = 202; resA = 101; resB = 102;
  // Exames
  await s.pool.query(`INSERT INTO exam_documents (id,client_id,hash,file_name,lab_name,empresa_id) VALUES (301,21,'hashA','exame-a.pdf','Lab A',5),(302,22,'hashB','exame-b.pdf','Lab B',6)`);
  await s.pool.query(`INSERT INTO exam_results (exam_document_id,client_id,analyte_name_raw,value_raw,empresa_id) VALUES (301,21,'GLICOSE','91',5),(302,22,'GLICOSE','150',6)`);
  docA = 301; docB = 302;
  const login = async (email: string) => {
    const r = await req("post", "/api/collaborator/login", undefined, { identifier: email, password: SENHA_C });
    if (r.status !== 200) throw new Error(`login ${email} ${r.status}`); return r.body.token as string;
  };
  const loginPac = async (cpf: string) => {
    const r = await req("post", "/api/area-paciente/login", undefined, { cpf, password: SENHA_P });
    if (r.status !== 200 || !r.body.token) throw new Error(`login paciente ${r.status}`); return r.body.token as string;
  };
  medAcento = await login("medica-acento@teste.com"); admA = await login("admin-a@teste.com"); admB = await login("admin-b@teste.com");
  medA = await login("medica-a@teste.com"); medB = await login("medico-b@teste.com");
  pacA = await loginPac(CPF_A); pacB = await loginPac(CPF_B);
  // Medicações autodeclaradas pelos clientes (rota real do cliente) e consentimento de cada um para a PRÓPRIA clínica.
  const nova = (nome: string) => ({ nome, doseValor: 10, doseUnidade: "mg", periodos: ["manha"] });
  const ca = await req("post", "/api/area-paciente/medicacoes", pacA, nova("Remedio da A"));
  const cb = await req("post", "/api/area-paciente/medicacoes", pacB, nova("Remedio da B"));
  if (ca.status !== 201 || cb.status !== 201) throw new Error(`medicação ${ca.status}/${cb.status}`);
  medicA = (await q(`SELECT id FROM cliente_medicacoes WHERE client_id=21`))[0].id;
  medicB = (await q(`SELECT id FROM cliente_medicacoes WHERE client_id=22`))[0].id;
  await s.pool.query(`INSERT INTO cliente_medicacao_consentimentos (client_id,empresa_id,versao_texto,texto_hash) VALUES (21,5,'v','h'),(22,6,'v','h')`);
}, 400_000);
afterAll(async () => { await s?.parar(); });

describe("AGENDA: leituras", () => {
  it("controle positivo: cada médico lê a própria agenda, janelas e horários", async () => {
    const a = await req("get", "/api/sessions", medA); const b = await req("get", "/api/sessions", medB);
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(a.body.map((x: any) => x.id)).toEqual([sessA]); expect(b.body.map((x: any) => x.id)).toEqual([sessB]);
    expect((await req("get", `/api/sessions/${sessA}`, medA)).status).toBe(200);
    const jan = await req("get", `/api/agenda/resources/${resA}/windows`, medA);
    expect(jan.status).toBe(200); expect(JSON.stringify(jan.body)).toContain("08:00");
    const slots = await req("get", `/api/agenda/slots?resourceId=${resA}&date=2027-03-08`, medA);
    expect(slots.status).toBe(200);
  });
  it("sessão, janelas e horários da outra clínica: 403/404 e sem dado no corpo", async () => {
    for (const [tok, sess, res] of [[medA, sessB, resB], [medB, sessA, resA]] as const) {
      const rs = await req("get", `/api/sessions/${sess}`, tok);
      exigirRecusa(rs, "sessão alheia");
      expect(JSON.stringify(rs.body)).not.toMatch(/Cliente [AB] Sintetica|sessao [AB]/);
      const jan = await req("get", `/api/agenda/resources/${res}/windows`, tok);
      exigirRecusa(jan, "janelas alheias");
      expect(JSON.stringify(jan.body)).not.toContain("08:00");
      // pedido válido (resourceId + date): a recusa vem do isolamento, não de validação
      exigirRecusa(await req("get", `/api/agenda/slots?resourceId=${res}&date=2027-03-08`, tok), "horários de agenda alheia");
    }
    const lista = await req("get", "/api/agenda/resources", medA);
    expect(lista.status).toBe(200);
    expect(JSON.stringify(lista.body)).not.toContain("Agenda B");
    expect((await req("get", "/api/agenda/resources", medB)).body.map((r: any) => r.name)).not.toContain("Agenda A");
  });
});

describe("AGENDA: escritas e estado do banco", () => {
  const fotoAgenda = async () => ({
    sessoes: await q(`SELECT id,status,notes,scheduled_date,scheduled_time,agenda_archived,empresa_id,client_id,resource_id FROM sessions ORDER BY id`),
    recursos: await q(`SELECT id,name,empresa_id,professional_id FROM agenda_resources ORDER BY id`),
    janelas: await q(`SELECT resource_id,weekday,start_time,end_time,active FROM agenda_windows ORDER BY id`),
  });
  const JANELA_B = [{ weekday: 1, startTime: "08:00", endTime: "12:00" }];
  it("alterar, cancelar ou marcar na agenda/sessão da outra clínica: 403/404 e banco idêntico", async () => {
    const antes = await fotoAgenda();
    exigirRecusa(await req("put", `/api/sessions/${sessB}`, medA, { notes: "invadida", status: "cancelled" }), "PUT sessão alheia");
    exigirRecusa(await req("delete", `/api/agenda/book/${sessB}`, medA), "cancelar marcação alheia");
    // corpo válido (substanceId + confirmed): a recusa vem do isolamento, não da validação
    const conf = await req("post", `/api/sessions/${sessB}/confirm-substance`, medA, { substanceId: 1, confirmed: true });
    exigirRecusa(conf, "confirmar substância em sessão alheia", [404]);
    exigirRecusa(await req("put", `/api/agenda/resources/${resB}`, admA, { name: "Invadida" }), "PUT agenda alheia");
    exigirRecusa(await req("put", `/api/agenda/resources/${resB}/windows`, admA, { windows: [], expectedWindows: JANELA_B }), "PUT janelas alheias");
    exigirRecusa(await req("post", "/api/agenda/book-avulsa", medA, { resourceId: resB, clientId: 22, date: "2027-03-08", time: "09:00" }), "marcar na agenda alheia com cliente alheio");
    exigirRecusa(await req("post", "/api/agenda/book-avulsa", medA, { resourceId: resB, clientId: 21, date: "2027-03-08", time: "09:00" }), "marcar na agenda alheia com cliente próprio");
    const cliAlheio = await req("post", "/api/agenda/book-avulsa", medA, { resourceId: resA, clientId: 22, date: "2027-03-08", time: "09:00" });
    exigirRecusa(cliAlheio, "cliente de outra clínica na agenda própria");
    expect(await fotoAgenda()).toEqual(antes);
  });
  it("controle positivo: a própria clínica consegue marcar, regravar janelas iguais, alterar e cancelar", async () => {
    const book = await req("post", "/api/agenda/book-avulsa", medA, { resourceId: resA, clientId: 21, date: "2027-03-08", time: "09:00", durationMinutes: 30 });
    expect(book.status, JSON.stringify(book.body)).toBe(201);
    const novaId = book.body.session.id as number;
    expect((await q(`SELECT empresa_id,client_id,resource_id FROM sessions WHERE id=$1`, [novaId]))[0]).toEqual({ empresa_id: 5, client_id: 21, resource_id: resA });
    const jan = await req("put", `/api/agenda/resources/${resA}/windows`, admA, { windows: JANELA_B, expectedWindows: JANELA_B });
    expect(jan.status, JSON.stringify(jan.body)).toBe(200);
    expect((await req("put", `/api/agenda/resources/${resA}`, admA, { name: "Agenda A" })).status).toBe(200);
    const del = await req("delete", `/api/agenda/book/${novaId}`, medA);
    expect(del.status, JSON.stringify(del.body)).toBe(200);
  });
  it("sem token: 401 nas rotas de agenda", async () => {
    for (const u of ["/api/sessions", "/api/agenda/resources"]) expect((await request(s.app).get(u)).status).toBe(401);
  });
});

describe("EXAMES: leituras e escritas", () => {
  const fotoExames = async () => ({
    docs: await q(`SELECT id,client_id,file_name,lab_name,collection_date,status,empresa_id FROM exam_documents ORDER BY id`),
    res: await q(`SELECT id,client_id,value_raw,empresa_id FROM exam_results ORDER BY id`),
  });
  it("controle positivo: o médico da clínica lê documentos, resultados e detalhe do próprio cliente", async () => {
    const a = await req("get", "/api/exames-lab/documentos", medA);
    expect(a.status).toBe(200);
    expect(JSON.stringify(a.body)).toContain("exame-a.pdf");
    expect(JSON.stringify(a.body)).not.toContain("exame-b.pdf");
    expect((await req("get", "/api/exames-lab/resultados?clientId=21", medA)).status).toBe(200);
    expect((await req("get", `/api/exames-lab/documentos/${docA}`, medA)).status).toBe(200);
    expect((await req("get", "/api/exames-lab/evolucao/21", medA)).status).toBe(200);
  });
  it("cliente, resultados e documento da outra clínica: 403/404 e sem dado no corpo", async () => {
    for (const [tok, cli, doc, nomeDoc] of [[medA, 22, docB, "exame-b.pdf"], [medB, 21, docA, "exame-a.pdf"]] as const) {
      for (const u of [`/api/exames-lab/resultados?clientId=${cli}`, `/api/exames-lab/documentos?clientId=${cli}`, `/api/exames-lab/evolucao/${cli}`,
        `/api/exames-lab/documentos/${doc}`, `/api/exames-lab/documento/${doc}/arquivo`, `/api/exames-lab/documento/${doc}/download`, `/api/exames-lab/documento/${doc}/links`]) {
        const r = await req("get", u, tok);
        exigirRecusa(r, `GET ${u}`);
        expect(JSON.stringify(r.body), u).not.toMatch(/exame-[ab]\.pdf|Lab [AB]|"value_?[rR]aw"/);
      }
    }
  });
  it("editar, reprocessar ou clonar documento da outra clínica: 403/404 e banco idêntico", async () => {
    const antes = await fotoExames();
    exigirRecusa(await req("patch", `/api/exames-lab/documento/${docB}`, medA, { labName: "Invadido", collectionDate: "2020-01-01" }), "PATCH documento alheio");
    exigirRecusa(await req("post", `/api/exames-lab/reprocessar/${docB}`, medA, {}), "reprocessar documento alheio");
    exigirRecusa(await req("post", `/api/exames-lab/documento/${docB}/clonar-drive`, medA, {}), "clonar documento alheio");
    expect(await fotoExames()).toEqual(antes);
  });
  it("controle positivo: a própria clínica edita os metadados do próprio documento", async () => {
    const r = await req("patch", `/api/exames-lab/documento/${docA}`, medA, { labName: "Lab A editado" });
    expect(r.status).toBe(200);
    expect((await q(`SELECT lab_name FROM exam_documents WHERE id=$1`, [docA]))[0].lab_name).toBe("Lab A editado");
    expect((await q(`SELECT lab_name FROM exam_documents WHERE id=$1`, [docB]))[0].lab_name).toBe("Lab B");
  });
  it("cliente: só vê a própria evolução; sem token 401", async () => {
    const a = await req("get", "/api/area-paciente/exames/evolucao", pacA);
    expect(a.status).toBe(200); expect(JSON.stringify(a.body)).not.toContain("150");
    expect((await request(s.app).get("/api/area-paciente/exames/evolucao")).status).toBe(401);
  });
});

describe("MEDICAÇÕES: leituras e escritas", () => {
  it("cliente lista só as próprias medicações", async () => {
    const a = await req("get", "/api/area-paciente/medicacoes", pacA); const b = await req("get", "/api/area-paciente/medicacoes", pacB);
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(JSON.stringify(a.body.proprias)).toContain("Remedio da A"); expect(JSON.stringify(a.body.proprias)).not.toContain("Remedio da B");
    expect(JSON.stringify(b.body.proprias)).toContain("Remedio da B"); expect(JSON.stringify(b.body.proprias)).not.toContain("Remedio da A");
  });
  it("cliente não edita, pausa nem apaga a medicação do outro; banco intacto", async () => {
    const antes = await q(`SELECT id,client_id,nome,estado,removido_em,dose_valor FROM cliente_medicacoes ORDER BY id`);
    exigirRecusa(await req("patch", `/api/area-paciente/medicacoes/${medicA}`, pacB, { nome: "Invadido" }), "editar medicação alheia", [404]);
    exigirRecusa(await req("patch", `/api/area-paciente/medicacoes/${medicA}`, pacB, { pausada: true }), "pausar medicação alheia", [404]);
    exigirRecusa(await req("delete", `/api/area-paciente/medicacoes/${medicA}`, pacB), "apagar medicação alheia", [404]);
    expect(await q(`SELECT id,client_id,nome,estado,removido_em,dose_valor FROM cliente_medicacoes ORDER BY id`)).toEqual(antes);
  });
  it("médico: cliente da outra clínica não abre medicações nem decide", async () => {
    for (const [tok, cli, med] of [[medA, 22, medicB], [medB, 21, medicA]] as const) {
      const g = await req("get", `/api/cockpit/${cli}/medicacoes`, tok);
      expect(recusado(g.status), `cockpit ${g.status}`).toBe(true);
      expect(JSON.stringify(g.body)).not.toMatch(/Remedio da [AB]/);
      const antes = await q(`SELECT id,estado,validado_por FROM cliente_medicacoes WHERE id=$1`, [med]).catch(() => q(`SELECT id,estado FROM cliente_medicacoes WHERE id=$1`, [med]));
      const d = await req("post", `/api/cockpit/${cli}/medicacoes/${med}/decisao`, tok, { decisao: "validar" });
      expect(recusado(d.status), `decisão ${d.status}`).toBe(true);
      expect(await q(`SELECT id,estado${antes[0] && "validado_por" in antes[0] ? ",validado_por" : ""} FROM cliente_medicacoes WHERE id=$1`, [med])).toEqual(antes);
    }
  });
  it("médico: decisão com cliente da própria clínica mas medicação de outro cliente não vale", async () => {
    const d = await req("post", `/api/cockpit/21/medicacoes/${medicB}/decisao`, medA, { decisao: "validar" });
    expect(d.status).toBe(404);
    expect((await q(`SELECT estado FROM cliente_medicacoes WHERE id=$1`, [medicB]))[0].estado).toBe("nao_validada");
  });
  it("fila da clínica mostra só clientes da própria clínica", async () => {
    const a = await req("get", "/api/cockpit-medicacoes/fila", medA); const b = await req("get", "/api/cockpit-medicacoes/fila", medB);
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(a.body.itens.map((i: any) => i.clientId)).toEqual([21]);
    expect(b.body.itens.map((i: any) => i.clientId)).toEqual([22]);
  });
  it("controle positivo: o médico da clínica decide; quem não é médico, não (mesmo com acesso à clínica)", async () => {
    const sel = () => q(`SELECT estado FROM cliente_medicacoes WHERE id=$1`, [medicA]);
    expect((await sel())[0].estado).toBe("nao_validada");
    const semPerfil = await req("post", `/api/cockpit/21/medicacoes/${medicA}/decisao`, admA, { decisao: "validar" });
    expect(semPerfil.status, "administrativo não decide").toBe(403);
    expect((await sel())[0].estado).toBe("nao_validada");
    const ok = await req("post", `/api/cockpit/21/medicacoes/${medicA}/decisao`, medA, { decisao: "validar" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect((await sel())[0].estado).not.toBe("nao_validada");
    expect((await q(`SELECT estado FROM cliente_medicacoes WHERE id=$1`, [medicB]))[0].estado).toBe("nao_validada");
  });
  it("controle positivo: médica cadastrada com categoria acentuada ('Médica') também decide", async () => {
    const nova = await req("post", "/api/area-paciente/medicacoes", pacA, { nome: "Remedio 2 da A", doseValor: 5, doseUnidade: "mg", periodos: ["noite"] });
    expect(nova.status).toBe(201);
    const id = (await q(`SELECT id FROM cliente_medicacoes WHERE client_id=21 AND nome='Remedio 2 da A'`))[0].id;
    const r = await req("post", `/api/cockpit/21/medicacoes/${id}/decisao`, medAcento, { decisao: "validar" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await q(`SELECT estado FROM cliente_medicacoes WHERE id=$1`, [id]))[0].estado).not.toBe("nao_validada");
  });
  it("consentimento de uma clínica não abre a outra: sem consentimento para a clínica, o médico não vê a medicação", async () => {
    await s.pool.query(`UPDATE cliente_medicacao_consentimentos SET revogado_em=now() WHERE client_id=21 AND empresa_id=5`);
    const g = await req("get", "/api/cockpit/21/medicacoes", medA);
    expect(g.status).toBe(200); expect(g.body.cadastradasPeloCliente.itens).toEqual([]);
    expect((await req("get", "/api/cockpit-medicacoes/fila", medA)).body.itens).toEqual([]);
  });
  it("sem token: 401", async () => {
    expect((await request(s.app).get("/api/area-paciente/medicacoes")).status).toBe(401);
    expect((await request(s.app).get("/api/cockpit-medicacoes/fila")).status).toBe(401);
  });
});
