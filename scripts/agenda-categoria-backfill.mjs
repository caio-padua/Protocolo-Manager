/**
 * Carga AUDITADA da categoria profissional em agendas legadas (agenda_resources.category_id nulo).
 *
 * Só grava quando há PROVA no banco: a agenda tem um profissional individual ATIVO, esse profissional
 * tem categoria (professional_areas) ativa e a classe dessa categoria bate com o tipo antigo da agenda
 * (medico -> categoria do tipo médico; enfermagem -> slug "enfermagem"). Nada é deduzido pelo nome.
 * Agenda compartilhada (sem profissional) ou sem prova fica PENDENTE para conferência humana.
 *
 * Uso:
 *   DATABASE_URL=... node scripts/agenda-categoria-backfill.mjs           # simulação (não grava)
 *   DATABASE_URL=... node scripts/agenda-categoria-backfill.mjs --apply   # grava + auditoria, em 1 transação
 *
 * Requer a coluna category_id e a tabela agenda_resource_category_audit (criadas na inicialização da API
 * ou por scripts/migrations/20261111_agenda_recurso_categoria.sql). Nunca altera nome, local, profissional.
 */
import { createRequire } from "node:module";
const require = createRequire(new URL("../lib/db/package.json", import.meta.url));
const pg = require("pg");

const apply = process.argv.includes("--apply");
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL ausente."); process.exit(2); }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const classeDaCategoria = (c) => (c.professional_type === "medico" ? "medico" : c.slug === "enfermagem" ? "enfermagem" : "categoria");

const client = await pool.connect();
try {
  await client.query("BEGIN");
  const rows = (await client.query(`SELECT r.id, r.name, r.kind, r.active, r.professional_id,
      p.active AS prof_active, a.id AS area_id, a.name AS area_name, a.slug, a.professional_type, a.active AS area_active
    FROM agenda_resources r
    LEFT JOIN professionals p ON p.id = r.professional_id
    LEFT JOIN professional_areas a ON a.id = p.area_id
    WHERE r.category_id IS NULL ORDER BY r.id FOR UPDATE OF r`)).rows;
  const relatorio = [];
  for (const r of rows) {
    let motivo = null;
    if (!r.professional_id) motivo = "agenda compartilhada, sem profissional gravado";
    else if (!r.prof_active) motivo = "profissional inativo";
    else if (!r.area_id || !r.area_active) motivo = "profissional sem categoria ativa";
    else if (classeDaCategoria(r) !== r.kind) motivo = `classe da categoria (${classeDaCategoria(r)}) diverge do tipo antigo (${r.kind})`;
    if (motivo) { relatorio.push({ id: r.id, agenda: r.name, resultado: "PENDENTE", motivo }); continue; }
    const evidencia = `Profissional ${r.professional_id} ativo com categoria ${r.area_name} (id ${r.area_id}); classe confere com o tipo antigo ${r.kind}.`;
    if (apply) {
      await client.query("UPDATE agenda_resources SET category_id=$2 WHERE id=$1 AND category_id IS NULL", [r.id, r.area_id]);
      await client.query(`INSERT INTO agenda_resource_category_audit(resource_id, previous_category_id, category_id, origin, evidence)
        VALUES ($1, NULL, $2, 'carga_auditada', $3)`, [r.id, r.area_id, evidencia]);
    }
    relatorio.push({ id: r.id, agenda: r.name, resultado: apply ? "GRAVADA" : "GRAVARIA", categoria: r.area_name, evidencia });
  }
  if (apply) await client.query("COMMIT"); else await client.query("ROLLBACK");
  console.table(relatorio);
  console.log(`${apply ? "Aplicado" : "Simulação"}: ${relatorio.filter((x) => x.resultado !== "PENDENTE").length} com prova, ${relatorio.filter((x) => x.resultado === "PENDENTE").length} pendentes.`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error("Falhou, nada gravado:", e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
