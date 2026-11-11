import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { userInfo } from "node:os";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";
import { AGENDA_CATEGORIA_AUDITORIA_DDL } from "../lib/agenda-recurso-categoria";

const run = promisify(execFile);
let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const q = (text: string, params?: any[]) => isolated.pool.query(text, params);
const script = new URL("../../../../scripts/agenda-categoria-backfill.mjs", import.meta.url).pathname;
const url = () => `postgresql://${userInfo().username}@/postgres?host=${encodeURIComponent(isolated.pool.options.host)}&port=55432`;
const executar = (...args: string[]) => run("node", [script, ...args], { env: { PATH: process.env.PATH!, DATABASE_URL: url() } });

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  await q(`
    CREATE TABLE professional_areas (id integer PRIMARY KEY, name text, slug text, professional_type text, active boolean);
    CREATE TABLE professionals (id integer PRIMARY KEY, area_id integer, active boolean);
    CREATE TABLE agenda_resources (id serial PRIMARY KEY, name text, kind text, professional_id integer, category_id integer, active boolean DEFAULT true);
    INSERT INTO professional_areas VALUES (1,'Medicina','medicina','medico',true),(2,'Enfermagem','enfermagem','nao_medico',true),(8,'Biomedicina','biomedicina','nao_medico',true);
    INSERT INTO professionals VALUES (6,1,true),(7,1,false),(9,2,true),(10,NULL,true);
    INSERT INTO agenda_resources(id,name,kind,professional_id) VALUES
      (1,'medico com prova','medico',6),(2,'compartilhada','enfermagem',NULL),(3,'profissional inativo','medico',7),
      (4,'classe diverge','enfermagem',6),(5,'sem categoria do profissional','medico',10),(6,'enfermagem com prova','enfermagem',9);
    INSERT INTO agenda_resources(id,name,kind,professional_id,category_id) VALUES (7,'ja confirmada','medico',6,1);
  `);
  await q(AGENDA_CATEGORIA_AUDITORIA_DDL);
}, 60_000);
afterAll(async () => { if (isolated) await isolated.stop(); }, 60_000);

describe("carga auditada da categoria das agendas legadas", () => {
  it("simulação não grava nada", async () => {
    const { stdout } = await executar();
    expect(stdout).toContain("2 com prova, 4 pendentes");
    expect((await q("SELECT count(*)::int n FROM agenda_resources WHERE category_id IS NOT NULL")).rows[0].n).toBe(1);
    expect((await q("SELECT count(*)::int n FROM agenda_resource_category_audit")).rows[0].n).toBe(0);
  });

  it("--apply grava só os casos provados, com auditoria, e é repetível", async () => {
    await executar("--apply");
    const gravadas = (await q("SELECT id, category_id FROM agenda_resources WHERE category_id IS NOT NULL ORDER BY id")).rows;
    expect(gravadas).toEqual([{ id: 1, category_id: 1 }, { id: 6, category_id: 2 }, { id: 7, category_id: 1 }]);
    const audit = (await q("SELECT resource_id, origin, previous_category_id FROM agenda_resource_category_audit ORDER BY resource_id")).rows;
    expect(audit).toEqual([
      { resource_id: 1, origin: "carga_auditada", previous_category_id: null },
      { resource_id: 6, origin: "carga_auditada", previous_category_id: null },
    ]);
    const pendentes = (await q("SELECT id FROM agenda_resources WHERE category_id IS NULL ORDER BY id")).rows.map((r: any) => r.id);
    expect(pendentes).toEqual([2, 3, 4, 5]);
    const { stdout } = await executar("--apply");
    expect(stdout).toContain("0 com prova, 4 pendentes");
    expect((await q("SELECT count(*)::int n FROM agenda_resource_category_audit")).rows[0].n).toBe(2);
  });
});
