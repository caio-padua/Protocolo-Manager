import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";
import { conferirRevisaoDose } from "../lib/revisao-dose-origem";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
let migration: string;

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  await isolated.pool.query(`
    CREATE TABLE substances(id integer PRIMARY KEY, name text NOT NULL, default_dose text,
      concentration_mg text, volume_ampola text, presentation_quantity real, presentation_unit text, ampoule_volume_ml real,
      is_blend boolean DEFAULT false);
    CREATE TABLE substance_blend_components(id serial PRIMARY KEY, substance_id integer NOT NULL
      REFERENCES substances(id) ON DELETE CASCADE, component_substance_id integer REFERENCES substances(id) ON DELETE SET NULL,
      sort_order integer NOT NULL DEFAULT 0, component_name text NOT NULL, dose_value real, dose_unit text,
      quantity real, quantity_unit text, notes text, created_at timestamptz DEFAULT NOW() NOT NULL);
    INSERT INTO substances(id,name,default_dose) VALUES (1,'Substância A','100 mg'),(2,'Substância B','200 mg');
  `);
  migration = await readFile(new URL("../../../../lib/db/migrations/20261111-revisao-dose-substancia.sql", import.meta.url), "utf8");
  await isolated.pool.query(migration);
}, 60_000);

afterAll(async () => { if (isolated) await isolated.stop(); }, 60_000);

async function revision(id: number): Promise<bigint> {
  const result = await isolated.pool.query("SELECT revisao_dose FROM substances WHERE id=$1", [id]);
  return BigInt(result.rows[0].revisao_dose);
}

describe("revisão monotônica da dose em banco descartável", () => {
  it("preserva os dados originais e suporta repetir a migração", async () => {
    await isolated.pool.query(migration);
    const result = await isolated.pool.query("SELECT id,name,default_dose,revisao_dose FROM substances ORDER BY id");
    expect(result.rows).toEqual([
      { id: 1, name: "Substância A", default_dose: "100 mg", revisao_dose: "0" },
      { id: 2, name: "Substância B", default_dose: "200 mg", revisao_dose: "0" },
    ]);
  });
  it("detecta A para B e de volta para A, mesmo com texto final igual", async () => {
    const inicial = await revision(1);
    await isolated.pool.query("UPDATE substances SET default_dose='150 mg' WHERE id=1");
    const meio = await revision(1);
    await isolated.pool.query("UPDATE substances SET default_dose='100 mg' WHERE id=1");
    expect(meio).toBe(inicial + 1n);
    expect(await revision(1)).toBe(inicial + 2n);
  });
  it("detecta mudança de nome e não incrementa alteração sem mudança", async () => {
    const inicial = await revision(1);
    await isolated.pool.query("UPDATE substances SET name='Substância A nova' WHERE id=1");
    await isolated.pool.query("UPDATE substances SET name='Substância A nova' WHERE id=1");
    expect(await revision(1)).toBe(inicial + 1n);
  });
  it("marca mudanças nos campos de apresentação usados para interpretar a dose", async () => {
    const inicial = await revision(1);
    await isolated.pool.query("UPDATE substances SET presentation_quantity=1,presentation_unit='ampola',ampoule_volume_ml=2 WHERE id=1");
    await isolated.pool.query("UPDATE substances SET concentration_mg='5 mg/mL',volume_ampola='2 mL' WHERE id=1");
    await isolated.pool.query("UPDATE substances SET ampoule_volume_ml=5 WHERE id=1");
    await isolated.pool.query("UPDATE substances SET ampoule_volume_ml=2 WHERE id=1");
    expect(await revision(1)).toBe(inicial + 4n);
  });
  it("incrementa nas alterações dos componentes, inclusive ao mover e excluir", async () => {
    const a = await revision(1), b = await revision(2);
    const inserted = await isolated.pool.query("INSERT INTO substance_blend_components(substance_id,component_name,dose_value,dose_unit) VALUES (1,'Vitamina A',10,'mg') RETURNING id");
    const id = inserted.rows[0].id;
    await isolated.pool.query("UPDATE substance_blend_components SET dose_value=20 WHERE id=$1", [id]);
    await isolated.pool.query("UPDATE substance_blend_components SET substance_id=2 WHERE id=$1", [id]);
    await isolated.pool.query("DELETE FROM substance_blend_components WHERE id=$1", [id]);
    expect(await revision(1)).toBe(a + 3n);
    expect(await revision(2)).toBe(b + 2n);
  });
  it("não conserva incrementos de uma transação cancelada", async () => {
    const inicial = await revision(1), client = await isolated.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE substances SET default_dose='500 mg' WHERE id=1");
      await client.query("ROLLBACK");
    } finally { client.release(); }
    expect(await revision(1)).toBe(inicial);
  });
  it("serializa gravações simultâneas sem perder incrementos", async () => {
    const inicial = await revision(1);
    await Promise.all(Array.from({ length: 8 }, (_, i) =>
      isolated.pool.query("UPDATE substances SET default_dose=$1 WHERE id=1", [`${i + 400} mg`])));
    expect(await revision(1)).toBe(inicial + 8n);
  });
  it("rejeita redução manual do contador", async () => {
    await expect(isolated.pool.query("UPDATE substances SET revisao_dose=0 WHERE id=1")).rejects.toThrow("não pode diminuir");
  });
  it("exige confirmação e revisão atual ao vincular uma dose", async () => {
    const client = await isolated.pool.connect();
    try {
      await client.query("BEGIN");
      const atual = String(await revision(1));
      await expect(conferirRevisaoDose(client, null, 1, [{ id: 1, revisaoObservada: atual }], false)).rejects.toThrow("conferência médica");
      await expect(conferirRevisaoDose(client, null, 1, [{ id: 1, revisaoObservada: "0" }], true)).rejects.toThrow("mudou desde");
      await expect(conferirRevisaoDose(client, null, 1, [{ id: 1, revisaoObservada: atual }], true))
        .resolves.toEqual({ proximaRevisao: atual });
      await client.query("COMMIT");
    } finally { client.release(); }
  });
  it("recusa desvincular após A para B para A sem nova conferência", async () => {
    const anterior = String(await revision(1));
    const nome = (await isolated.pool.query("SELECT name FROM substances WHERE id=1")).rows[0].name;
    await isolated.pool.query("UPDATE substances SET default_dose='999 mg' WHERE id=1");
    await isolated.pool.query("UPDATE substances SET default_dose='100 mg' WHERE id=1");
    const client = await isolated.pool.connect();
    try {
      await client.query("BEGIN");
      const antiga = { id: 1, revisaoConfirmada: anterior };
      await expect(conferirRevisaoDose(client, antiga, null, [], false)).rejects.toThrow("conferência médica");
      await expect(conferirRevisaoDose(client, antiga, null, [{ id: 1, revisaoObservada: anterior }], true)).rejects.toThrow("mudou desde");
      const atual = String(await revision(1));
      await expect(conferirRevisaoDose(client, antiga, null, [{ id: 1, revisaoObservada: atual }], true))
        .resolves.toEqual({ proximaRevisao: null });
      expect((await client.query("SELECT name,default_dose FROM substances WHERE id=1")).rows[0])
        .toEqual({ name: nome, default_dose: "100 mg" });
      await client.query("COMMIT");
    } finally { client.release(); }
  });
  it("exige conferência das duas origens ao trocar e recusa origem inexistente", async () => {
    const client = await isolated.pool.connect();
    try {
      await client.query("BEGIN");
      const a = String(await revision(1)), b = String(await revision(2));
      const anterior = { id: 1, revisaoConfirmada: a };
      await expect(conferirRevisaoDose(client, anterior, 2, [{ id: 2, revisaoObservada: b }], true)).rejects.toThrow("mudou desde");
      await expect(conferirRevisaoDose(client, anterior, 2, [
        { id: 1, revisaoObservada: a }, { id: 2, revisaoObservada: b },
      ], true)).resolves.toEqual({ proximaRevisao: b });
      await expect(conferirRevisaoDose(client, anterior, 999, [], true)).rejects.toThrow("não está disponível");
      await client.query("COMMIT");
    } finally { client.release(); }
  });
  it("mantém bloqueio da origem até o fim da transação que conferiu", async () => {
    const leitor = await isolated.pool.connect(), escritor = await isolated.pool.connect();
    try {
      await leitor.query("BEGIN");
      const atual = String(await revision(1));
      await conferirRevisaoDose(leitor, null, 1, [{ id: 1, revisaoObservada: atual }], true);
      await escritor.query("BEGIN");
      await escritor.query("SET LOCAL lock_timeout = '150ms'");
      await expect(escritor.query("UPDATE substances SET default_dose='777 mg' WHERE id=1")).rejects.toThrow(/lock timeout/);
      await escritor.query("ROLLBACK");
      await leitor.query("COMMIT");
      await escritor.query("UPDATE substances SET default_dose='777 mg' WHERE id=1");
      expect(await revision(1)).toBe(BigInt(atual) + 1n);
    } finally {
      await leitor.query("ROLLBACK").catch(() => undefined);
      await escritor.query("ROLLBACK").catch(() => undefined);
      leitor.release();
      escritor.release();
    }
  });
  it("movimenta componentes em sentidos opostos sem espera circular", async () => {
    const inseridos = await isolated.pool.query(`INSERT INTO substance_blend_components(substance_id,component_name)
      VALUES (1,'Componente de A'),(2,'Componente de B') RETURNING id,substance_id`);
    const idA = inseridos.rows.find((r: { substance_id: number }) => r.substance_id === 1).id;
    const idB = inseridos.rows.find((r: { substance_id: number }) => r.substance_id === 2).id;
    const a = await revision(1), b = await revision(2);
    const bloqueio = await isolated.pool.connect(), primeiro = await isolated.pool.connect(), segundo = await isolated.pool.connect();
    try {
      await bloqueio.query("BEGIN");
      await bloqueio.query("SELECT id FROM substances WHERE id IN (1,2) ORDER BY id FOR UPDATE");
      await primeiro.query("SET statement_timeout='5s'");
      await segundo.query("SET statement_timeout='5s'");
      const mudancaA = primeiro.query("UPDATE substance_blend_components SET substance_id=2 WHERE id=$1", [idA]);
      const mudancaB = segundo.query("UPDATE substance_blend_components SET substance_id=1 WHERE id=$1", [idB]);
      const prazo = Date.now() + 3000;
      let espera = 0;
      do {
        const result = await isolated.pool.query(`SELECT count(*)::int AS total FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock'
            AND query ILIKE 'UPDATE substance_blend_components SET substance_id=%'`);
        espera = result.rows[0].total;
        if (espera < 2) await new Promise((resolve) => setTimeout(resolve, 25));
      } while (espera < 2 && Date.now() < prazo);
      expect(espera).toBe(2);
      await bloqueio.query("COMMIT");
      await Promise.all([mudancaA, mudancaB]);
      expect(await revision(1)).toBe(a + 2n);
      expect(await revision(2)).toBe(b + 2n);
    } finally {
      await bloqueio.query("ROLLBACK").catch(() => undefined);
      bloqueio.release(); primeiro.release(); segundo.release();
    }
  }, 12_000);
  it("trata revisão inválida e estrutura ausente sem aceitar a origem", async () => {
    const tx = {
      query: async () => { throw Object.assign(new Error("coluna ausente"), { code: "42703" }); },
    };
    await expect(conferirRevisaoDose(tx, null, 1, [{ id: 1, revisaoObservada: "9223372036854775808" }], true))
      .rejects.toThrow("inválidos");
    await expect(conferirRevisaoDose(tx, null, 1, [null as never], true))
      .rejects.toThrow("inválidos");
    await expect(conferirRevisaoDose(tx, null, 1, [{ id: 1, revisaoObservada: "0" }], true))
      .rejects.toMatchObject({ status: 503 });
  });
  it("não impede o comportamento existente de exclusão em cascata", async () => {
    await isolated.pool.query("INSERT INTO substances(id,name,default_dose) VALUES (3,'Apresentação temporária',NULL)");
    await isolated.pool.query("INSERT INTO substance_blend_components(substance_id,component_name) VALUES (3,'Componente temporário')");
    await isolated.pool.query("DELETE FROM substances WHERE id=3");
    expect((await isolated.pool.query("SELECT count(*)::int AS total FROM substance_blend_components WHERE substance_id=3")).rows[0].total).toBe(0);
  });
  it("rejeita migração com gatilho anterior incompatível sem substituí-lo em silêncio", async () => {
    const client = await isolated.pool.connect();
    try {
      await client.query(`DROP TRIGGER paxter_revisao_dose_componentes ON substance_blend_components;
        CREATE TRIGGER paxter_revisao_dose_componentes AFTER INSERT OR UPDATE OR DELETE ON substance_blend_components
        FOR EACH ROW EXECUTE FUNCTION paxter_revisao_dose_componentes()`);
      await expect(client.query(migration)).rejects.toThrow("definição inesperada");
      await client.query("ROLLBACK");
      const existente = await client.query(`SELECT tgtype FROM pg_trigger
        WHERE tgrelid='substance_blend_components'::regclass AND tgname='paxter_revisao_dose_componentes'`);
      expect(existente.rows[0].tgtype).toBe(29);
    } finally {
      client.release();
    }
  });
});
