import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";
import { createTableFromSchema } from "./helpers/schema-ddl";

// Dados 100% sintéticos em Postgres descartável (Código Paxter, Art. 82).
const state = vi.hoisted(() => ({ database: null as any, audit: [] as any[] }));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const db = new Proxy({}, {
    get(_target, key) {
      const value = state.database?.[key];
      return typeof value === "function" ? value.bind(state.database) : value;
    },
  });
  return { ...schema, db };
});
vi.mock("../lib/clinical-access", () => ({
  clinicManagementPermission: async () => ({ allowed: false }),
  currentResponsibleDoctor: async () => null,
}));
vi.mock("../lib/objectStorage.js", () => ({ ObjectStorageService: class {} }));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) => {
    if (!req.headers["x-test-role"]) { res.status(401).json({ error: "Não autenticado" }); return; }
    req.collaborator = { professionalId: req.headers["x-test-role"] === "owner" ? 301 : 302 };
    next();
  },
  recordProfessionalProfileChange: async (_tx: any, _req: any, previous: any, next: any) => {
    state.audit.push({ previous, next });
  },
  isValidCpf: () => true,
  normalizeCpf: (value: string) => String(value).replace(/\D/g, ""),
  getVerifiedGoogleEmail: async () => null,
}));

import professionalsRouter from "../routes/professionals";
import locationsRouter from "../routes/locations";
import { empresasTable, locationProfessionalsTable, locationsTable, professionalAreasTable,
  professionalSpecialtiesTable, professionalsTable } from "@workspace/db/schema";
import { aplicarVinculosEmpresa, carregarVinculosEmpresa, validarLocalParaProfissional,
  VinculoEmpresaError } from "../lib/professional-empresas";
import { PROFESSIONAL_EMPRESAS_BACKFILL, PROFESSIONAL_EMPRESAS_DDL } from "../lib/ensure-professional-empresas-schema";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const sql = (text: string, params: unknown[] = []) => isolated.pool.query(text, params);

const app = express();
app.use(express.json(), (req, _res, next) => {
  const role = req.headers["x-test-role"];
  const empresa = Number(req.headers["x-test-empresa"] ?? 5);
  req.tenantContext = {
    authenticated: !!role, empresaId: empresa, isPlatformOwner: role === "owner",
    professionalId: role === "owner" ? 301 : 302,
  } as any;
  next();
}, professionalsRouter, locationsRouter);

const owner = (empresa = 5) => ({ "x-test-role": "owner", "x-test-empresa": String(empresa) });
const staff = (empresa = 5) => ({ "x-test-role": "staff", "x-test-empresa": String(empresa) });
const vinculos = async (id: number) =>
  (await sql("SELECT empresa_id, ordem FROM professional_empresas WHERE professional_id=$1 ORDER BY ordem", [id])).rows
    .map((r: any) => `${r.ordem}:${r.empresa_id}`);
const empresaOriginaria = async (id: number) =>
  (await sql("SELECT empresa_id FROM professionals WHERE id=$1", [id])).rows[0].empresa_id;
const snapshot = async () =>
  (await sql("SELECT professional_id, empresa_id, ordem FROM professional_empresas ORDER BY professional_id, ordem")).rows;

async function seed() {
  await sql(`INSERT INTO empresas (id, nome, tipo, status, ativa, is_platform_owner) VALUES
    (2,'Empresa Dois','clinic','ATIVO',true,false), (3,'Empresa Tres','clinic','ATIVO',true,false),
    (5,'Empresa Cinco','clinic','ATIVO',true,false), (6,'Empresa Seis','clinic','ATIVO',true,false),
    (7,'Empresa Sete','genesis_seed','ATIVO',true,false), (8,'Empresa Inativa','clinic','ATIVO',false,false),
    (9,'Empresa Arquivada','clinic','ARQUIVADA',true,false), (10,'Dona Plataforma','clinic','ATIVO',true,true),
    (11,'Empresa Outro Tipo','outro','ATIVO',true,false), (12,'Empresa Doze','clinic','ATIVO',true,false),
    (13,'Empresa Treze','clinic','ATIVO',true,false)`);
  await sql(`INSERT INTO locations (id, name, empresa_id, active) VALUES
    (101,'Local E5',5,'true'), (102,'Local legado sem empresa',NULL,'true'), (103,'Local E2',2,'true'),
    (104,'Local E3',3,'true'), (106,'Local E6',6,'true'), (107,'Local E7',7,'true'),
    (112,'Local E12',12,'true'), (113,'Local E13',13,'true')`);
  await sql(`INSERT INTO professionals (id, name, empresa_id, active) VALUES
    (201,'Profissional Sintetico A',5,true), (202,'Profissional Sintetico B',NULL,true),
    (203,'Profissional Sintetico C',5,true), (204,'Profissional Sintetico D',5,true),
    (205,'Profissional Sintetico E',5,true), (301,'Dono Sintetico',5,true)`);
  // C: ja atende em local da empresa 2. D: atende em 5 empresas diferentes da originaria.
  await sql(`INSERT INTO location_professionals (location_id, professional_id, role) VALUES
    (103,203,'executor'), (101,205,'executor'),
    (103,204,'executor'), (104,204,'executor'), (106,204,'executor'), (107,204,'executor'), (112,204,'executor')`);
  await sql("SELECT setval(pg_get_serial_sequence('professionals','id'), 1000)");
}

async function resetVinculos() {
  await sql("DELETE FROM professional_empresas");
  await sql("UPDATE professionals SET empresa_id=5 WHERE id IN (201,203,204,205)");
  await sql("UPDATE professionals SET empresa_id=NULL WHERE id=202");
  await sql("DELETE FROM location_professionals WHERE professional_id IN (201,202)");
  state.audit.length = 0;
}

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const table of [empresasTable, locationsTable, locationProfessionalsTable, professionalsTable,
    professionalAreasTable, professionalSpecialtiesTable]) {
    await sql(createTableFromSchema(table));
  }
  await seed();
}, 90_000);
afterAll(async () => {
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);

describe("carga inicial e migração (idempotência)", () => {
  it("migração em arquivo roda duas vezes e preserva acessos existentes sem tocar agendas", async () => {
    const migration = await readFile(
      new URL("../../../../scripts/migrations/20261109_profissional_empresas.sql", import.meta.url), "utf8");
    const agendasAntes = (await sql("SELECT count(*)::int AS n FROM location_professionals")).rows[0].n;
    await sql(migration);
    const primeira = await snapshot();
    await sql(migration);
    expect(await snapshot()).toEqual(primeira);
    // C (empresa 5, agenda na empresa 2) mantém o acesso como adicional.
    expect(await vinculos(203)).toEqual(["2:2"]);
    // A e B nunca tiveram acesso fora da originária (B sem empresa = 5).
    expect(await vinculos(201)).toEqual([]);
    expect(await vinculos(202)).toEqual([]);
    expect((await sql("SELECT count(*)::int AS n FROM location_professionals")).rows[0].n).toBe(agendasAntes);
  });

  it("limita a 4 adicionais, nunca apaga agenda e o boot (ensure) chega ao mesmo resultado", async () => {
    // D tem 5 empresas fora da originária: entram as 4 menores (2,3,6,7); a 12 fica de fora, sem perda de agenda.
    expect(await vinculos(204)).toEqual(["2:2", "3:3", "4:6", "5:7"]);
    expect((await sql("SELECT count(*)::int AS n FROM location_professionals WHERE professional_id=204")).rows[0].n).toBe(5);
    const viaMigracao = await snapshot();
    await sql("DROP TABLE professional_empresas");
    for (const statement of PROFESSIONAL_EMPRESAS_DDL) await sql(statement);
    await sql(PROFESSIONAL_EMPRESAS_BACKFILL);
    await sql(PROFESSIONAL_EMPRESAS_BACKFILL);
    expect(await snapshot()).toEqual(viaMigracao);
  });

  it("a tabela recusa posição fora de 2..5, repetição de empresa e repetição de posição", async () => {
    await expect(sql("INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (201,2,1)")).rejects.toThrow();
    await expect(sql("INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (201,2,6)")).rejects.toThrow();
    await sql("INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (201,2,2)");
    await expect(sql("INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (201,2,3)")).rejects.toThrow();
    await expect(sql("INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (201,3,2)")).rejects.toThrow();
    await sql("DELETE FROM professional_empresas WHERE professional_id=201");
  });
});

describe("regras de vínculo (biblioteca)", () => {
  beforeEach(resetVinculos);
  const aplicar = (id: number, pedido: any) => state.database.transaction((tx: any) => aplicarVinculosEmpresa(tx, id, pedido));
  const erroDe = async (promessa: Promise<unknown>) => {
    try { await promessa; } catch (error) { return error as VinculoEmpresaError; }
    throw new Error("era esperado um erro");
  };

  it("grava a ordem pedida, reordena e informa a mudança", async () => {
    expect((await aplicar(201, { adicionaisIds: [3, 2] })).depois.map((v: { ordem: number; empresaId: number }) => `${v.ordem}:${v.empresaId}`)).toEqual(["1:5", "2:3", "3:2"]);
    const reordenado = await aplicar(201, { adicionaisIds: [2, 3] });
    expect(reordenado.mudou).toBe(true);
    expect(await vinculos(201)).toEqual(["2:2", "3:3"]);
    expect((await aplicar(201, { adicionaisIds: [2, 3] })).mudou).toBe(false);
  });

  it("recusa repetição, originária repetida, mais de 5 empresas e ids inválidos", async () => {
    expect((await erroDe(aplicar(201, { adicionaisIds: [2, 2] }))).status).toBe(400);
    expect((await erroDe(aplicar(201, { adicionaisIds: [5] }))).status).toBe(400);
    expect((await erroDe(aplicar(201, { adicionaisIds: [2, 3, 6, 7, 12] }))).status).toBe(400);
    expect((await erroDe(aplicar(201, { adicionaisIds: ["2"] as any }))).status).toBe(400);
    expect((await erroDe(aplicar(201, { originariaId: -1 }))).status).toBe(400);
    expect(await vinculos(201)).toEqual([]);
  });

  it("recusa empresa inativa, arquivada, dona da plataforma, de outro tipo ou inexistente", async () => {
    for (const empresaId of [8, 9, 10, 11, 999]) {
      const erro = await erroDe(aplicar(201, { adicionaisIds: [empresaId] }));
      expect([empresaId, erro.status, erro.body.empresaIds]).toEqual([empresaId, 400, [empresaId]]);
    }
    expect(await vinculos(201)).toEqual([]);
  });

  it("empresa já vinculada que hoje está inativa não bloqueia outros ajustes", async () => {
    await sql("INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (201,8,2)");
    await aplicar(201, { adicionaisIds: [8, 3] });
    expect(await vinculos(201)).toEqual(["2:8", "3:3"]);
  });

  it("retirar empresa com agenda liberada é recusado (409) e nada muda", async () => {
    await sql("INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (201,2,2),(201,3,3)");
    await sql("INSERT INTO location_professionals (location_id, professional_id, role) VALUES (103,201,'executor')");
    const erro = await erroDe(aplicar(201, { adicionaisIds: [3] }));
    expect(erro.status).toBe(409);
    expect(erro.body).toMatchObject({ code: "EMPRESA_COM_AGENDA_LIBERADA", empresaId: 2, agendas: [{ locationId: 103, nome: "Local E2" }] });
    expect(await vinculos(201)).toEqual(["2:2", "3:3"]);
    await sql("DELETE FROM location_professionals WHERE professional_id=201");
    await aplicar(201, { adicionaisIds: [3] });
    expect(await vinculos(201)).toEqual(["2:3"]);
  });

  it("trocar o originário: antiga com agenda bloqueia; sem agenda troca; secundária promovida sai da lista", async () => {
    await sql("INSERT INTO location_professionals (location_id, professional_id, role) VALUES (101,201,'executor')");
    expect((await erroDe(aplicar(201, { originariaId: 3 }))).status).toBe(409);
    expect(await empresaOriginaria(201)).toBe(5);
    await sql("DELETE FROM location_professionals WHERE professional_id=201");
    await sql("INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (201,2,2),(201,3,3)");
    const trocado = await aplicar(201, { originariaId: 3 });
    expect(trocado.depois.map((v: { ordem: number; empresaId: number }) => `${v.ordem}:${v.empresaId}`)).toEqual(["1:3", "2:2"]);
    expect(await empresaOriginaria(201)).toBe(3);
    expect(await vinculos(201)).toEqual(["2:2"]);
  });

  it("sem empresa gravada o originário é o Instituto Pádua (5)", async () => {
    const lista = (await carregarVinculosEmpresa(202))!;
    expect(lista).toMatchObject([{ ordem: 1, papel: "originario", empresaId: 5, nome: "Empresa Cinco" }]);
    expect(await carregarVinculosEmpresa(98765)).toBeNull();
  });

  it("duas gravações simultâneas (com a trava do profissional) não violam a unicidade", async () => {
    const travado = (pedido: any) => state.database.transaction(async (tx: any) => {
      await tx.select().from(professionalsTable).where(eq(professionalsTable.id, 201)).for("update");
      return aplicarVinculosEmpresa(tx, 201, pedido);
    });
    const resultados = await Promise.allSettled([
      travado({ adicionaisIds: [2, 3, 6, 7] }), travado({ adicionaisIds: [7, 6, 3, 2] }),
    ]);
    expect(resultados.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    expect((await vinculos(201)).length).toBe(4);
  });

  it("valida o local contra as empresas do profissional", async () => {
    await sql("INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (201,3,2)");
    expect(await validarLocalParaProfissional(201, 101)).toEqual({ permitido: true });
    expect(await validarLocalParaProfissional(201, 102)).toEqual({ permitido: true });
    expect(await validarLocalParaProfissional(201, 104)).toEqual({ permitido: true });
    expect(await validarLocalParaProfissional(201, 103)).toMatchObject({ permitido: false, status: 409, code: "EMPRESA_NAO_VINCULADA" });
    expect(await validarLocalParaProfissional(201, 9999)).toMatchObject({ permitido: false, status: 404 });
    expect(await validarLocalParaProfissional(9999, 101)).toMatchObject({ permitido: false, status: 404 });
  });
});

describe("rotas de profissionais", () => {
  beforeEach(resetVinculos);

  it("GET /professionals/:id/empresas: exige login; dono vê as 5 posições; não-dono só a empresa da sessão", async () => {
    await sql("INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (201,3,2)");
    expect((await request(app).get("/professionals/201/empresas")).status).toBe(401);
    const dono = await request(app).get("/professionals/201/empresas").set(owner());
    expect(dono.status).toBe(200);
    expect(dono.body).toMatchObject({ limite: 5, vinculos: [{ ordem: 1, empresaId: 5 }, { ordem: 2, empresaId: 3, nome: "Empresa Tres" }] });
    const outro = await request(app).get("/professionals/201/empresas").set(staff());
    expect(outro.body.vinculos.map((v: any) => v.empresaId)).toEqual([5]);
  });

  it("PUT /professionals/:id/empresas: só o dono; salva, devolve e registra no histórico", async () => {
    const corpo = { adicionaisIds: [2, 3] };
    expect((await request(app).put("/professionals/201/empresas").send(corpo)).status).toBe(401);
    expect((await request(app).put("/professionals/201/empresas").set(staff()).send(corpo)).status).toBe(403);
    expect((await request(app).put("/professionals/201/empresas").set(owner()).send({})).status).toBe(400);
    const ok = await request(app).put("/professionals/201/empresas").set(owner()).send(corpo);
    expect(ok.status).toBe(200);
    expect(ok.body.vinculos.map((v: any) => `${v.ordem}:${v.empresaId}`)).toEqual(["1:5", "2:2", "3:3"]);
    expect(await vinculos(201)).toEqual(["2:2", "3:3"]);
    expect(state.audit).toHaveLength(1);
    expect(state.audit[0].next.empresasAdicionaisNomes).toEqual(["Empresa Dois", "Empresa Tres"]);
    expect(state.audit[0].previous.empresasAdicionaisNomes).toEqual([]);
    // sem mudança não gera histórico
    await request(app).put("/professionals/201/empresas").set(owner()).send(corpo);
    expect(state.audit).toHaveLength(1);
  });

  it("PUT /professionals/:id/empresas: 409 lista as agendas e não grava", async () => {
    await sql("INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (201,2,2)");
    await sql("INSERT INTO location_professionals (location_id, professional_id, role) VALUES (103,201,'executor')");
    const bloqueado = await request(app).put("/professionals/201/empresas").set(owner()).send({ adicionaisIds: [] });
    expect(bloqueado.status).toBe(409);
    expect(bloqueado.body.agendas).toEqual([{ locationId: 103, nome: "Local E2" }]);
    expect(await vinculos(201)).toEqual(["2:2"]);
  });

  it("PUT /professionals/:id troca o originário na mesma gravação e a falha desfaz o resto", async () => {
    const trocado = await request(app).put("/professionals/201").set(owner()).send({ empresaOriginariaId: 3 });
    expect(trocado.status).toBe(200);
    expect(await empresaOriginaria(201)).toBe(3);
    const invalido = await request(app).put("/professionals/201").set(owner(3)).send({ name: "Nome Que Nao Pode Gravar", empresaOriginariaId: 8 });
    expect(invalido.status).toBe(400);
    const textoInvalido = await request(app).put("/professionals/201").set(owner(3)).send({ empresaOriginariaId: "5" });
    expect(textoInvalido.status).toBe(400);
    expect((await sql("SELECT name FROM professionals WHERE id=201")).rows[0].name).toBe("Profissional Sintetico A");
    await sql("INSERT INTO location_professionals (location_id, professional_id, role) VALUES (104,201,'executor')");
    const bloqueado = await request(app).put("/professionals/201").set(owner(3))
      .send({ name: "Outro Nome Que Nao Grava", empresaOriginariaId: 6 });
    expect(bloqueado.status).toBe(409);
    expect((await sql("SELECT name, empresa_id FROM professionals WHERE id=201")).rows[0])
      .toEqual({ name: "Profissional Sintetico A", empresa_id: 3 });
  });

  it("POST /professionals usa a empresa escolhida como originária e recusa empresa inelegível", async () => {
    const corpo = (extra: object) => ({ name: "Cadastro Sintetico", serviceTypes: ["presencial"], email: `sint-${Math.random().toString(36).slice(2)}@exemplo.test`, ...extra });
    const criado = await request(app).post("/professionals").set(owner()).send(corpo({ empresaOriginariaId: 6 }));
    expect(criado.status).toBe(201);
    expect(await empresaOriginaria(criado.body.id)).toBe(6);
    const padrao = await request(app).post("/professionals").set(owner(3)).send(corpo({}));
    expect(await empresaOriginaria(padrao.body.id)).toBe(3);
    for (const empresaOriginariaId of [8, 9, 10, 999, "6"]) {
      expect((await request(app).post("/professionals").set(owner()).send(corpo({ empresaOriginariaId }))).status).toBe(400);
    }
  });

  it("GET /professionals: profissional aparece nas empresas originária e adicionais; dono recebe o resumo", async () => {
    await sql("INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (201,3,2)");
    const naTres = await request(app).get("/professionals").set(owner(3));
    const registro = naTres.body.find((p: any) => p.id === 201);
    expect(registro).toMatchObject({ empresaOriginariaId: 5, empresaOriginariaNome: "Empresa Cinco" });
    expect(registro.empresasVinculadas.map((v: any) => `${v.ordem}:${v.empresaId}`)).toEqual(["1:5", "2:3"]);
    const naSeis = await request(app).get("/professionals").set(owner(6));
    expect(naSeis.body.find((p: any) => p.id === 201)).toBeUndefined();
    const comum = await request(app).get("/professionals").set(staff(3));
    expect(comum.body.find((p: any) => p.id === 201).empresasVinculadas).toBeUndefined();
  });

  it("agendas: só em empresas do profissional; lista traz a empresa de cada vínculo", async () => {
    await sql("INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (201,3,2)");
    const fora = await request(app).post("/professionals/201/locations").set(owner()).send({ locationId: 103 });
    expect(fora.status).toBe(404);
    const propria = await request(app).post("/professionals/201/locations").set(owner()).send({ locationId: 101 });
    expect(propria.status).toBe(201);
    const adicional = await request(app).post("/professionals/201/locations").set(owner()).send({ locationId: 104 });
    expect(adicional.status).toBe(201);
    const lista = await request(app).get("/professionals/201/locations").set(owner());
    expect(lista.body.map((l: any) => `${l.locationId}:${l.empresaId}`).sort()).toEqual(["101:5", "104:3"]);
    // quem não é dono só vê a empresa da sessão
    const comum = await request(app).get("/professionals/201/locations").set(staff());
    expect(comum.body.map((l: any) => l.locationId)).toEqual([101]);
    const apagar = await request(app).delete("/professionals/201/locations/104").set(owner());
    expect(apagar.status).toBeLessThan(300);
    expect((await sql("SELECT location_id FROM location_professionals WHERE professional_id=201 ORDER BY 1")).rows)
      .toEqual([{ location_id: 101 }]);
  });
});

describe("POST /locations/:id/professionals (antes sem nenhuma proteção)", () => {
  beforeEach(resetVinculos);
  const liberar = (headers: Record<string, string>, locationId: number, professionalId: unknown) =>
    request(app).post(`/locations/${locationId}/professionals`).set(headers).send({ professionalId });

  it("exige login e dono da plataforma", async () => {
    expect((await request(app).post("/locations/101/professionals").send({ professionalId: 201 })).status).toBe(401);
    expect((await liberar(staff(), 101, 201)).status).toBe(403);
    expect((await sql("SELECT count(*)::int AS n FROM location_professionals WHERE professional_id=201")).rows[0].n).toBe(0);
  });

  it("recusa local de empresa não vinculada, aceita o vinculado e não duplica", async () => {
    const fora = await liberar(owner(), 103, 201);
    expect(fora.status).toBe(409);
    expect(fora.body.code).toBe("EMPRESA_NAO_VINCULADA");
    expect((await liberar(owner(), 101, 201)).status).toBe(201);
    expect((await liberar(owner(), 101, 201)).status).toBe(200);
    expect((await sql("SELECT count(*)::int AS n FROM location_professionals WHERE professional_id=201")).rows[0].n).toBe(1);
    expect((await liberar(owner(), 101, "abc")).status).toBe(400);
    expect((await liberar(owner(), 9999, 201)).status).toBe(404);
  });
});
