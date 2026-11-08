// Operação excepcional autorizada: Google somente leitura; limpeza local transacional.
// Sem --executar, apenas inventaria. Nunca recebe ou imprime credenciais.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
if (process.argv.includes("--executar")) {
  throw new Error("Execução bloqueada: a rotina antiga exclui dados e não preserva o histórico das agendas.");
}
const requireDb = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Client } = requireDb("pg");
const snapshot = JSON.parse(await readFile(new URL("../.local/agenda-carga-google.json", import.meta.url), "utf8"));
assert.equal(snapshot.account, "clinica.padua.agenda@gmail.com", "Conta divergente");
assert.equal(snapshot.from, "2026-09-01T00:00:00-03:00");
assert.equal(snapshot.calendars.length, 10);
const floor = Date.parse(snapshot.from);
for (const calendar of snapshot.calendars) {
  const keys = new Set();
  for (const event of calendar.events) {
    assert(event.eventId && !keys.has(event.eventId), "Evento sem identidade ou duplicado");
    keys.add(event.eventId);
    assert(Date.parse(event.inicio) >= floor, "Evento anterior ao corte");
    assert(Date.parse(event.fim) > Date.parse(event.inicio), "Duração inválida");
  }
}
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SELECT pg_advisory_xact_lock(476092026)");
  // Congelar os produtores afetados enquanto a troca ocorre.
  await client.query("LOCK TABLE sessions, substance_applications, agenda_resources, agenda_windows, agenda_exceptions, locations, agenda_compromissos IN SHARE ROW EXCLUSIVE MODE");
  const { rows: locations } = await client.query(
    "SELECT id,google_calendar_id,agenda_papel FROM locations WHERE empresa_id=5 AND google_calendar_id=ANY($1::text[]) ORDER BY id",
    [snapshot.calendars.map((c) => c.calendar.id)],
  );
  assert.equal(locations.length, 10, "Vínculos de destino incompletos");
  assert.equal(new Set(locations.map((l) => l.google_calendar_id)).size, 10);
  const { rows: loaded } = await client.query("SELECT count(*)::int n FROM agenda_compromissos WHERE origem IN ('google','google_recorrente')");
  assert.equal(loaded[0].n, 0, "Carga já realizada; repetição da limpeza recusada");
  const invariants = async () => {
    const tables = ["clients", "protocols", "protocol_items", "ras", "ras_evolutivo", "nursing_assessments", "validation_codes", "task_cards", "email_log", "scheduling_requests"];
    const result = {};
    for (const table of tables) result[table] = (await client.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;
    return result;
  };
  const before = await invariants();
  await client.query(`CREATE TEMP TABLE protected_sessions ON COMMIT DROP AS
    SELECT s.id FROM sessions s WHERE
      EXISTS(SELECT 1 FROM ras x WHERE x.session_id=s.id)
      OR EXISTS(SELECT 1 FROM ras_evolutivo x WHERE x.session_id=s.id)
      OR EXISTS(SELECT 1 FROM nursing_assessments x WHERE x.session_id=s.id)
      OR EXISTS(SELECT 1 FROM validation_codes x WHERE x.session_id=s.id)
      OR EXISTS(SELECT 1 FROM task_cards x WHERE x.session_id=s.id)
      OR EXISTS(SELECT 1 FROM email_log x WHERE x.session_id=s.id)
      OR EXISTS(SELECT 1 FROM client_ratings x WHERE x.session_id=s.id)`);
  const inventory = (await client.query(`SELECT
    (SELECT count(*)::int FROM sessions WHERE empresa_id=5 OR empresa_id IS NULL) AS sessoes_antigas,
    (SELECT count(*)::int FROM protected_sessions) AS suporte_documental,
    (SELECT count(*)::int FROM agenda_resources) AS recursos_antigos,
    (SELECT count(*)::int FROM agenda_compromissos) AS compromissos_antigos`)).rows[0];
  console.log(JSON.stringify({ modo: process.argv.includes("--executar") ? "execução" : "prévia", ...inventory,
    preparados: snapshot.calendars.reduce((total, calendar) => total + calendar.events.length, 0) }));
  if (!process.argv.includes("--executar")) {
    await client.query("ROLLBACK");
  } else {
    await client.query(`UPDATE sessions SET agenda_archived=true WHERE (empresa_id=5 OR empresa_id IS NULL)
      AND id IN (SELECT id FROM protected_sessions)`);
    const applications = await client.query(`DELETE FROM substance_applications a USING sessions s
      WHERE a.session_id=s.id AND (s.empresa_id=5 OR s.empresa_id IS NULL)
      AND NOT EXISTS(SELECT 1 FROM protected_sessions p WHERE p.id=s.id)`);
    const deleted = await client.query(`DELETE FROM sessions s WHERE (empresa_id=5 OR empresa_id IS NULL)
      AND NOT EXISTS(SELECT 1 FROM protected_sessions p WHERE p.id=s.id)`);
    // Definições referenciadas por documentos ou cobranças não podem ficar órfãs.
    await client.query("UPDATE agenda_resources SET active=false,google_calendar_id=NULL");
    await client.query("DELETE FROM agenda_windows");
    await client.query("DELETE FROM agenda_exceptions");
    const resources = await client.query(`DELETE FROM agenda_resources r
      WHERE NOT EXISTS(SELECT 1 FROM sessions s WHERE s.resource_id=r.id)
      AND NOT EXISTS(SELECT 1 FROM scheduling_requests q WHERE q.resource_id=r.id)
      AND NOT EXISTS(SELECT 1 FROM client_preferred_agendas p WHERE p.agenda_resource_id=r.id)`);
    const oldLinks = await client.query("UPDATE locations SET google_calendar_id=NULL WHERE google_calendar_id IS NOT NULL AND NOT(id=ANY($1::int[]))", [locations.map((l) => l.id)]);
    await client.query("DELETE FROM agenda_compromissos WHERE location_id=ANY($1::int[])", [locations.map((l) => l.id)]);
    let imported = 0, newResources = 0;
    for (const calendar of snapshot.calendars) {
      const location = locations.find((l) => l.google_calendar_id === calendar.calendar.id);
      await client.query("UPDATE locations SET color=$1 WHERE id=$2", [calendar.calendar.color, location.id]);
      for (const event of calendar.events) {
        await client.query(`INSERT INTO agenda_compromissos
          (location_id,google_calendar_id,chave,ical_uid,titulo,descricao,local_texto,inicio,fim,dia_inteiro,recorrencia,status,origem)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'ativo',$12)`,
          [location.id, calendar.calendar.id, `google:${event.eventId}`, event.icalUid, event.titulo,
            event.descricao, event.localTexto, event.inicio, event.fim, event.diaInteiro,
            event.recorrencia, event.origem ?? "google"]);
        imported++;
      }
      if (!["geral", "pessoal"].includes(location.agenda_papel)) {
        // Sem expediente: importação não equivale a autorização para abrir vagas.
        await client.query(`INSERT INTO agenda_resources
          (name,kind,modality,color,slot_minutes,professional_id,location_id,google_calendar_id,active,sort_order)
          VALUES($1,$2,$3,$4,30,$5,$6,$7,true,$6)`,
          [calendar.calendar.name.trim(), calendar.calendar.name.includes("ENFERMAGEM") ? "enfermagem" : "medico",
            location.agenda_papel === "remoto" ? "online" : "local", calendar.calendar.color,
            [35,36,38].includes(location.id) ? 6 : null, location.id, calendar.calendar.id]);
        newResources++;
      }
    }
    const after = await invariants();
    assert.deepEqual(after, before, "Alteração indevida em dados preservados");
    const checks = (await client.query(`SELECT
      (SELECT count(*)::int FROM sessions WHERE agenda_archived=false AND (empresa_id=5 OR empresa_id IS NULL)) AS sessoes_teste_visiveis,
      (SELECT count(*)::int FROM agenda_compromissos WHERE inicio < '2026-09-01T00:00:00-03:00') AS anteriores_ao_corte,
      (SELECT count(*)::int FROM agenda_compromissos WHERE origem IN ('google','google_recorrente')) AS importados`)).rows[0];
    assert.equal(checks.sessoes_teste_visiveis, 0);
    assert.equal(checks.anteriores_ao_corte, 0);
    assert.equal(checks.importados, imported);
    await client.query("COMMIT");
    console.log(JSON.stringify({ ...checks, sessoes_excluidas: deleted.rowCount,
      itens_de_sessao_excluidos: applications.rowCount, recursos_excluidos: resources.rowCount,
      vinculos_antigos_removidos: oldLinks.rowCount, recursos_atuais: newResources,
      dados_preservados: after, google: "somente leitura" }));
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
