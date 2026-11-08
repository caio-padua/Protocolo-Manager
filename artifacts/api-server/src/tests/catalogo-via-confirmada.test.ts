import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { readFile } from "node:fs/promises";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ database: null as any }));
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
vi.mock("../lib/substance-duration", async importOriginal => {
  const original = await importOriginal<typeof import("../lib/substance-duration")>();
  return { ...original, configuredDurationSeconds: async () => 150 };
});
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, _res: any, next: () => void) => {
    req.collaborator = { professionalId: 101 };
    req.tenantContext = { authenticated: true, professionalId: 101, isPlatformOwner: true };
    next();
  },
}));
import {
  catalogoInjetaveisTable, catalogoItensTable, catalogoFormulasTable,
  catalogoImplantesTable, catalogoBlendsTable, catalogoBlendAtivosTable,
  collaboratorAuditTable, professionalsTable, substancesTable, clientsTable, periodosDiaTable,
} from "@workspace/db/schema";
import { confirmarViaCatalogoAutorizada } from "../scripts/confirmar-via-catalogo-autorizada";
import { runTransmutacao } from "../lib/transmutacao";
import { travarCatalogoClinico } from "../lib/catalogo-via-confirmada";
import { importarCatalogoSubstancias } from "../lib/importar-catalogo-substancias";
import substancesRouter from "../routes/substances";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const tables = [professionalsTable, substancesTable, catalogoItensTable, catalogoInjetaveisTable,
  collaboratorAuditTable, periodosDiaTable, catalogoFormulasTable, catalogoImplantesTable,
  catalogoBlendsTable, catalogoBlendAtivosTable, clientsTable];

function createTableSql(table: any) {
  const definition = getTableConfig(table);
  const columns = definition.columns.map(column => {
    if (column.name === "id") return `"id" SERIAL PRIMARY KEY`;
    const isTime = ["created_at", "updated_at"].includes(column.name);
    return `"${column.name}" ${column.getSQLType()}${isTime ? " DEFAULT now()" : ""}`;
  });
  return `CREATE TABLE "${definition.name}" (${columns.join(", ")});`;
}

const input = {
  expectedDevelopmentDatabase: "", expectedDevelopmentSystemIdentifier: "",
  professionalId: 101, professionalName: "Profissional sintético", empresaId: 5,
  codigoPadcom: "SINTETICO-001", name: "Substância sintética",
  substanceId: 11, catalogId: 12, injectableId: 13,
  previousVia: "EV / IM", requestedVia: "IM" as const,
  expectedDose: "5 MG / 2 ML", expectedInjectableDose: "5 MG", expectedInjectableVolume: "2 ML",
};

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  // A migração é executada sobre o estado anterior, inclusive duas vezes.
  for (const table of tables) {
    let ddl = createTableSql(table);
    if (table === catalogoItensTable) ddl = ddl.replace(/, "via_uso_revisada" boolean/, "");
    if (table === catalogoInjetaveisTable) ddl = ddl.replace(/, "via_revisada" boolean/, "");
    await isolated.pool.query(ddl);
  }
  await isolated.pool.query("ALTER TABLE catalogo_itens ADD UNIQUE(codigo_padcom);");
  await isolated.pool.query("ALTER TABLE catalogo_injetaveis ADD UNIQUE(id_ihe);");
  await isolated.pool.query("ALTER TABLE substances ADD UNIQUE(codigo_padcom);");
  await isolated.pool.query("ALTER TABLE periodos_dia ADD UNIQUE(sigla);");
  await isolated.pool.query("ALTER TABLE catalogo_formulas ADD UNIQUE(id_ihe);");
  await isolated.pool.query("ALTER TABLE catalogo_implantes ADD UNIQUE(id_ihe);");
  await isolated.pool.query("ALTER TABLE catalogo_blends ADD UNIQUE(codigo_blend);");
  await isolated.pool.query(`INSERT INTO catalogo_itens (codigo_padcom,nome,via_uso)
    VALUES('LEGADO','Registro sintético legado','EV / IM');
    INSERT INTO catalogo_injetaveis(id_ihe,codigo_padcom,via)
    VALUES(999,'LEGADO','EV / IM');`);
  const migration = await readFile(new URL("../../../../scripts/migrations/20261108_catalogo_via_revisada.sql", import.meta.url), "utf8");
  await isolated.pool.query(migration);
  await isolated.pool.query(migration);
  expect((await isolated.pool.query("SELECT via_uso,via_uso_revisada FROM catalogo_itens WHERE codigo_padcom='LEGADO'")).rows[0])
    .toEqual({ via_uso: "EV / IM", via_uso_revisada: false });
  expect((await isolated.pool.query("SELECT via,via_revisada FROM catalogo_injetaveis WHERE codigo_padcom='LEGADO'")).rows[0])
    .toEqual({ via: "EV / IM", via_revisada: false });
  const identity = await isolated.pool.query(`SELECT current_database() name,
    (SELECT system_identifier::text FROM pg_control_system()) system_identifier`);
  input.expectedDevelopmentDatabase = identity.rows[0].name;
  input.expectedDevelopmentSystemIdentifier = identity.rows[0].system_identifier;
}, 60000);

beforeEach(async () => {
  await isolated.pool.query(`TRUNCATE professionals, substances, catalogo_itens, catalogo_injetaveis,
    collaborator_audit, periodos_dia, catalogo_formulas, catalogo_implantes, catalogo_blends,
    catalogo_blend_ativos, clients RESTART IDENTITY;
    INSERT INTO professionals (id,name,active,is_platform_owner,professional_type,empresa_id,crm)
      VALUES(101,'Profissional sintético',true,true,'medico',5,'123');
    INSERT INTO substances (id,name,category,color,default_dose,procedure_type,codigo_padcom,via_uso)
      VALUES(11,'Substância sintética','Sintético','azul','5 MG / 2 ML','im','SINTETICO-001','EV / IM');
    INSERT INTO catalogo_itens (id,codigo_padcom,nome,categoria,posologia,via_uso)
      VALUES(12,'SINTETICO-001','Substância sintética','injetavel_im','5 MG / 2 ML','EV / IM');
    INSERT INTO catalogo_injetaveis (id,id_ihe,codigo_padcom,nome_ampola,nome_exibicao,dosagem,volume,via)
      VALUES(13,13,'SINTETICO-001','Substância sintética','Substância sintética','5 MG','2 ML','EV / IM');
  `);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => { state.database = null; await isolated?.stop(); }, 60000);

async function readRoutes() {
  const result = await isolated.pool.query(`SELECT s.via_uso AS operacional,s.default_dose,s.procedure_type,
    c.via_uso AS item,c.via_uso_revisada,i.via AS injetavel,i.via_revisada
    FROM substances s JOIN catalogo_itens c USING(codigo_padcom)
    JOIN catalogo_injetaveis i USING(codigo_padcom) WHERE s.codigo_padcom='SINTETICO-001'`);
  return result.rows[0];
}

function mockSource(overrides: Record<string, unknown> = {}) {
  const item = {
    codigo_padcom: input.codigoPadcom, nome: input.name, categoria: "injetavel_im",
    posologia: input.expectedDose, composicao: null, via_uso: input.previousVia,
  };
  const injectable = {
    id: 13, codigo_padcom: input.codigoPadcom, nome_ampola: input.name, nome_exibicao: input.name,
    dosagem: input.expectedInjectableDose, volume: input.expectedInjectableVolume, via: input.previousVia,
    substancia_base: null,
  };
  const catalogo = { itens_terapeuticos: [{ ...item, ...(overrides.item as object ?? {}) }],
    injetaveis: [{ ...injectable, ...(overrides.injectable as object ?? {}) }] };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true, json: async () => url === "catalogo" ? catalogo : { pacientes: [] },
  })));
}

describe("via revisada em catálogo", () => {
  it("registra as três fontes e auditoria sem alterar dose", async () => {
    await confirmarViaCatalogoAutorizada(state.database, input);
    expect(await readRoutes()).toMatchObject({ operacional: "IM", item: "IM", injetavel: "IM",
      via_uso_revisada: true, via_revisada: true, default_dose: input.expectedDose, procedure_type: "im" });
    const audit = await isolated.pool.query("SELECT professional_id,subject_professional_id,detail FROM collaborator_audit");
    expect(audit.rows[0]).toMatchObject({ professional_id: null, subject_professional_id: 101,
      detail: { previousVia: "EV / IM", confirmedVia: "IM", executor: "Replit Agent" } });
  });

  it("reimporta fontes antigas sem substituir vias revisadas", async () => {
    await confirmarViaCatalogoAutorizada(state.database, input);
    mockSource();
    await runTransmutacao({ catalogoUrl: "catalogo", pacientesUrl: "pacientes" });
    await importarCatalogoSubstancias();
    expect(await readRoutes()).toMatchObject({ operacional: "IM", item: "IM", injetavel: "IM" });
  });

  it("rejeita mudança de identidade no item revisado", async () => {
    await confirmarViaCatalogoAutorizada(state.database, input);
    mockSource({ item: { posologia: "dose alterada" } });
    await expect(runTransmutacao({ catalogoUrl: "catalogo", pacientesUrl: "pacientes" }))
      .rejects.toThrow("exige nova conferência clínica");
    expect(await readRoutes()).toMatchObject({ operacional: "IM", item: "IM", injetavel: "IM" });
  });

  it("rejeita mudança da apresentação do injetável revisado", async () => {
    await confirmarViaCatalogoAutorizada(state.database, input);
    mockSource({ injectable: { volume: "volume alterado" } });
    await expect(runTransmutacao({ catalogoUrl: "catalogo", pacientesUrl: "pacientes" }))
      .rejects.toThrow("exige nova conferência clínica");
    expect(await readRoutes()).toMatchObject({ operacional: "IM", item: "IM", injetavel: "IM" });
  });

  it("recusa identificador novo para o mesmo código de um injetável revisado", async () => {
    await confirmarViaCatalogoAutorizada(state.database, input);
    mockSource({ injectable: { id: 999 } });
    await expect(runTransmutacao({ catalogoUrl: "catalogo", pacientesUrl: "pacientes" }))
      .rejects.toThrow("ausente ou duplicado");
    expect((await isolated.pool.query("SELECT id FROM catalogo_injetaveis")).rowCount).toBe(1);
  });

  it("recusa o remapeamento de um item revisado para outro código", async () => {
    await confirmarViaCatalogoAutorizada(state.database, input);
    mockSource({ item: { codigo_padcom: "OUTRO-CODIGO" } });
    await expect(runTransmutacao({ catalogoUrl: "catalogo", pacientesUrl: "pacientes" }))
      .rejects.toThrow("ausente ou duplicado");
    expect((await isolated.pool.query("SELECT id FROM catalogo_itens")).rowCount).toBe(1);
  });

  it("recusa troca simultânea de código, nome e dose antes de criar produto", async () => {
    await confirmarViaCatalogoAutorizada(state.database, input);
    mockSource({ item: { codigo_padcom: "OUTRO", nome: "Outro nome", posologia: "Outra dose" } });
    await expect(runTransmutacao({ catalogoUrl: "catalogo", pacientesUrl: "pacientes" }))
      .rejects.toThrow("ausente ou duplicado");
    await importarCatalogoSubstancias();
    expect((await isolated.pool.query("SELECT id FROM catalogo_itens")).rowCount).toBe(1);
    expect((await isolated.pool.query("SELECT id FROM substances")).rowCount).toBe(1);
    expect(await readRoutes()).toMatchObject({ operacional: "IM", item: "IM", injetavel: "IM" });
  });

  it("registros sem via revisada acompanham a fonte externa", async () => {
    mockSource({ item: { via_uso: "SC" }, injectable: { via: "SC" } });
    await runTransmutacao({ catalogoUrl: "catalogo", pacientesUrl: "pacientes" });
    expect(await readRoutes()).toMatchObject({ item: "SC", injetavel: "SC", via_uso_revisada: false, via_revisada: false });
  });

  it.each([
    ["dose divergente", { expectedDose: "dose incorreta" }],
    ["identidade divergente", { substanceId: 888 }],
    ["banco divergente", { expectedDevelopmentSystemIdentifier: "123" }],
    ["autoridade divergente", { professionalName: "Outra pessoa" }],
    ["empresa divergente", { empresaId: 99 }],
    ["via não autorizada", { requestedVia: "EV" }],
  ])("recusa %s sem alteração", async (_label, change) => {
    await expect(confirmarViaCatalogoAutorizada(state.database, { ...input, ...change } as any)).rejects.toThrow();
    expect(await readRoutes()).toMatchObject({ operacional: "EV / IM", item: "EV / IM", injetavel: "EV / IM" });
  });

  it("recusa proprietário que não esteja cadastrado como médico", async () => {
    await isolated.pool.query("UPDATE professionals SET professional_type='nao_medico' WHERE id=101");
    await expect(confirmarViaCatalogoAutorizada(state.database, input)).rejects.toThrow("médico proprietário");
    expect(await readRoutes()).toMatchObject({ operacional: "EV / IM", item: "EV / IM", injetavel: "EV / IM" });
  });

  it("recusa ambiente publicado", async () => {
    vi.stubEnv("REPLIT_DEPLOYMENT", "1");
    try {
      await expect(confirmarViaCatalogoAutorizada(state.database, input)).rejects.toThrow("ambiente publicado");
    } finally { vi.unstubAllEnvs(); }
  });

  it("reverte tudo quando a auditoria falha", async () => {
    await isolated.pool.query("ALTER TABLE collaborator_audit ADD CONSTRAINT audit_test CHECK(action <> 'agent_delegated_clinical_catalog_confirmation')");
    try {
      await expect(confirmarViaCatalogoAutorizada(state.database, input)).rejects.toThrow();
      expect(await readRoutes()).toMatchObject({ operacional: "EV / IM", item: "EV / IM", injetavel: "EV / IM" });
    } finally {
      await isolated.pool.query("ALTER TABLE collaborator_audit DROP CONSTRAINT audit_test");
    }
  });

  it("duas confirmações simultâneas geram somente uma alteração", async () => {
    const results = await Promise.allSettled([
      confirmarViaCatalogoAutorizada(state.database, input),
      confirmarViaCatalogoAutorizada(state.database, input),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await isolated.pool.query("SELECT id FROM collaborator_audit")).rowCount).toBe(1);
  });

  it("uma confirmação simultânea à reimportação mantém a via nas três fontes", async () => {
    const results = await Promise.all([
      confirmarViaCatalogoAutorizada(state.database, input),
      importarCatalogoSubstancias(),
    ]);
    expect(results).toHaveLength(2);
    expect(await readRoutes()).toMatchObject({ operacional: "IM", item: "IM", injetavel: "IM" });
  });

  it("uma confirmação simultânea à transmutação não retorna à via antiga", async () => {
    mockSource();
    await Promise.all([
      confirmarViaCatalogoAutorizada(state.database, input),
      runTransmutacao({ catalogoUrl: "catalogo", pacientesUrl: "pacientes" }),
    ]);
    expect(await readRoutes()).toMatchObject({ operacional: "IM", item: "IM", injetavel: "IM" });
  });

  it("confirmação concorrente com edição não grava classificação incompatível", async () => {
    const app = express();
    app.use(express.json(), substancesRouter);
    const [confirmation, edit] = await Promise.allSettled([
      confirmarViaCatalogoAutorizada(state.database, input),
      request(app).patch("/substances/11").send({ procedureType: "iv" }),
    ]);
    expect(edit.status).toBe("fulfilled");
    if (edit.status !== "fulfilled") return;
    const stateAfter = await readRoutes();
    if (confirmation.status === "fulfilled") {
      expect(edit.value.status).toBe(409);
      expect(stateAfter).toMatchObject({ operacional: "IM", procedure_type: "im", via_uso_revisada: true });
    } else {
      expect(edit.value.status).toBe(200);
      expect(stateAfter).toMatchObject({ operacional: "EV / IM", procedure_type: "iv", via_uso_revisada: false });
    }
  });

  it("a trava impede que duas gravações de catálogo avancem juntas", async () => {
    let secondAcquired = false;
    let release!: () => void;
    let locked!: () => void;
    const held = new Promise<void>(resolve => { locked = resolve; });
    const wait = new Promise<void>(resolve => { release = resolve; });
    const first = state.database.transaction(async (tx: any) => {
      await travarCatalogoClinico(tx);
      locked();
      await wait;
    });
    await held;
    const second = state.database.transaction(async (tx: any) => {
      await travarCatalogoClinico(tx);
      secondAcquired = true;
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(secondAcquired).toBe(false);
    release();
    await Promise.all([first, second]);
    expect(secondAcquired).toBe(true);
  });

  it.skipIf(!process.env.PAXTER_CATALOGO_CONFERIDO_PATH || !process.env.PAXTER_CATALOGO_CODIGO)(
    "confere a cadeia completa com uma cópia isolada da origem autenticada", async () => {
      const code = process.env.PAXTER_CATALOGO_CODIGO!;
      const source = JSON.parse(await readFile(process.env.PAXTER_CATALOGO_CONFERIDO_PATH!, "utf8"));
      const items = source.itens_terapeuticos.filter((r: any) => r.codigo_padcom === code);
      const injectables = source.injetaveis.filter((r: any) => r.codigo_padcom === code);
      expect(items).toHaveLength(1);
      expect(injectables).toHaveLength(1);
      const [item] = items;
      const [injectable] = injectables;
      expect(item.categoria).toBe("injetavel_im");
      expect(item.via_uso).toBe(injectable.via);

      await isolated.pool.query("TRUNCATE substances, catalogo_itens, catalogo_injetaveis RESTART IDENTITY");
      const savedSubstance = await isolated.pool.query(
        `INSERT INTO substances(name,category,color,default_dose,procedure_type,codigo_padcom,via_uso)
         VALUES($1,'Sintético','azul',$2,'im',$3,$4) RETURNING id`,
        [item.nome, item.posologia, code, item.via_uso],
      );
      const savedItem = await isolated.pool.query(
        `INSERT INTO catalogo_itens(codigo_padcom,nome,categoria,posologia,composicao,via_uso)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [code, item.nome, item.categoria, item.posologia, item.composicao ?? null, item.via_uso],
      );
      const savedInjectable = await isolated.pool.query(
        `INSERT INTO catalogo_injetaveis(id_ihe,codigo_padcom,nome_ampola,nome_exibicao,dosagem,volume,substancia_base,via)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [injectable.id, code, injectable.nome_ampola, injectable.nome_exibicao, injectable.dosagem,
          injectable.volume, injectable.substancia_base ?? null, injectable.via],
      );
      await confirmarViaCatalogoAutorizada(state.database, {
        ...input, codigoPadcom: code, name: item.nome, substanceId: savedSubstance.rows[0].id,
        catalogId: savedItem.rows[0].id, injectableId: savedInjectable.rows[0].id,
        previousVia: item.via_uso, expectedDose: item.posologia,
        expectedInjectableDose: injectable.dosagem, expectedInjectableVolume: injectable.volume,
      });
      vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
        ok: true, json: async () => url === "catalogo" ? source : { pacientes: [] },
      })));
      await runTransmutacao({ catalogoUrl: "catalogo", pacientesUrl: "pacientes" });
      await importarCatalogoSubstancias();
      const routes = await isolated.pool.query(`SELECT s.via_uso operacional,s.default_dose,
        c.via_uso item,i.via injetavel FROM substances s JOIN catalogo_itens c USING(codigo_padcom)
        JOIN catalogo_injetaveis i USING(codigo_padcom) WHERE s.codigo_padcom=$1`, [code]);
      expect(routes.rows).toEqual([{ operacional: "IM", default_dose: item.posologia, item: "IM", injetavel: "IM" }]);
    }, 60000,
  );
});
