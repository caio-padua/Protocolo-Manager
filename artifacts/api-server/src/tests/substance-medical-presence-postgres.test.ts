import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
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
vi.mock("../lib/secure-settings", () => ({ getSetting: vi.fn(async () => "150") }));

import { empresasTable, locationsTable, locationProfessionalsTable, professionalsTable, substancesTable, substanceBlendComponentsTable, catalogoItensTable } from "@workspace/db/schema";
import { basicAuthMiddleware } from "../middleware/basicAuth";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import router from "../routes/substances";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const app = express();
app.use(express.json(), basicAuthMiddleware, tenantContextMiddleware, router);
const owner = createCollaboratorToken({ professionalId: 101, role: "admin", credentialVersion: 2 });
const other = createCollaboratorToken({ professionalId: 102, role: "admin", credentialVersion: 0 });

function createTableSql(table: any) {
  const config = getTableConfig(table);
  const columns = config.columns.map(column => {
    if (column.name === "id") return `"id" SERIAL PRIMARY KEY`;
    const defaultNow = ["created_at", "updated_at"].includes(column.name) ? " DEFAULT now()" : "";
    return `"${column.name}" ${column.getSQLType()}${defaultNow}`;
  });
  return `CREATE TABLE "${config.name}" (${columns.join(", ")});`;
}

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const table of [empresasTable, locationsTable, locationProfessionalsTable, professionalsTable, substancesTable, substanceBlendComponentsTable, catalogoItensTable]) {
    await isolated.pool.query(createTableSql(table));
  }
  await isolated.pool.query(`
    INSERT INTO empresas(id,ativa,status) VALUES(5,true,'ATIVO'),(6,true,'ATIVO');
    INSERT INTO professionals(id,name,role,category,active,credential_version,empresa_id,is_platform_owner)
      VALUES(101,'Proprietário sintético','admin','admin',true,2,5,true),
            (102,'Outro profissional sintético','admin','admin',true,0,6,false);
    INSERT INTO substances(id,name,category,color,stock_quantity,duration_minutes,precise_duration_seconds,doctor_participation)
      VALUES(1,'Substância sintética','Teste','#123456',0,15,150,NULL);
  `);
}, 60_000);

afterAll(async () => {
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);

describe("participação médica com sessão e banco reais isolados", () => {
  it("nega alteração sem sessão e a profissional sem propriedade do catálogo", async () => {
    expect((await request(app).patch("/substances/1").send({ doctorParticipation: true })).status).toBe(401);
    expect((await request(app).patch("/substances/1").set("Authorization", `Bearer ${other}`)
      .send({ doctorParticipation: true })).status).toBe(403);
    expect((await isolated.pool.query("SELECT doctor_participation FROM substances WHERE id=1")).rows[0].doctor_participation).toBeNull();
  });

  it("persiste sim, preserva campo omitido, altera para não e permite voltar a indefinido", async () => {
    const base = { name: "Substância sintética", category: "Teste", color: "#123456", stockQuantity: 0, durationMinutes: 2.5 };
    const write = (body: object) => request(app).put("/substances/1").set("Authorization", `Bearer ${owner}`).send(body);
    const first = await write({ ...base, doctorParticipation: true });
    expect(first.status, first.text).toBe(200);
    expect(first.body.doctorParticipation).toBe(true);
    expect((await write(base)).body.doctorParticipation).toBe(true);
    expect((await request(app).get("/substances")).body[0].doctorParticipation).toBe(true);
    expect((await request(app).patch("/substances/1").set("Authorization", `Bearer ${owner}`)
      .send({ doctorParticipation: false })).body.doctorParticipation).toBe(false);
    expect((await write({ ...base, doctorParticipation: null })).body.doctorParticipation).toBeNull();
    expect((await isolated.pool.query("SELECT doctor_participation FROM substances WHERE id=1")).rows[0].doctor_participation).toBeNull();
  });

  it("impede que edição autorizada contradiga a via clínica confirmada", async () => {
    await isolated.pool.query(`UPDATE substances SET codigo_padcom='CODIGO-SINTETICO',procedure_type='im' WHERE id=1;
      INSERT INTO catalogo_itens(codigo_padcom,via_uso,via_uso_revisada)
      VALUES('CODIGO-SINTETICO','IM',true);`);
    const base = { name: "Substância sintética", category: "Teste", color: "#123456", stockQuantity: 0 };
    const put = await request(app).put("/substances/1").set("Authorization", `Bearer ${owner}`)
      .send({ ...base, procedureType: "iv" });
    const patch = await request(app).patch("/substances/1").set("Authorization", `Bearer ${owner}`)
      .send({ procedureType: "iv" });
    expect(put.status, put.text).toBe(409);
    expect(patch.status, patch.text).toBe(409);
    const compatible = await request(app).patch("/substances/1").set("Authorization", `Bearer ${owner}`)
      .send({ procedureType: "im" });
    expect(compatible.status, compatible.text).toBe(200);
    const compatiblePut = await request(app).put("/substances/1").set("Authorization", `Bearer ${owner}`)
      .send({ ...base, procedureType: "im" });
    expect(compatiblePut.status, compatiblePut.text).toBe(200);
    expect((await isolated.pool.query("SELECT procedure_type FROM substances WHERE id=1")).rows[0].procedure_type).toBe("im");
    await isolated.pool.query("UPDATE catalogo_itens SET via_uso_revisada=false WHERE codigo_padcom='CODIGO-SINTETICO'");
    expect((await request(app).patch("/substances/1").set("Authorization", `Bearer ${owner}`)
      .send({ procedureType: "iv" })).status).toBe(200);
  });
});
