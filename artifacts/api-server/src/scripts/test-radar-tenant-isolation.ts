/**
 * test-radar-tenant-isolation.ts
 *
 * Confirma que GET /radar-clinico com ?search= filtra por empresa_id e
 * nunca vaza pacientes entre tenants.
 *
 * Abordagem: executa a mesma SQL da rota diretamente contra o banco real,
 * com clientes de teste em dois tenants distintos (empresa 4 e empresa 5).
 *
 * Execução:
 *   cd artifacts/api-server
 *   npx tsx src/scripts/test-radar-tenant-isolation.ts
 */

import { pool } from "@workspace/db";

// ── Constantes de teste ───────────────────────────────────────────────────────
const TENANT_A = 4; // Instituto Genesis (já existe na tabela empresas)
const TENANT_B = 5; // Instituto Pádua  (já existe na tabela empresas)

// Sufixo único para não colidir com dados reais
const SUFIXO = `_RADAR_ISO_${Date.now()}`;

const NOME_COMPARTILHADO = `Beatriz${SUFIXO}`; // mesmo prefixo nos dois tenants
const NOME_EXCLUSIVO_A   = `Carlos${SUFIXO}`;  // só no tenant A

let clientIdA1 = -1;
let clientIdA2 = -1;
let clientIdB1 = -1;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A mesma SQL da rota GET /radar-clinico, parametrizada por empresa_id e search. */
async function queryRadar(empresaId: number, search: string | null) {
  const queryParams: (number | string)[] = [empresaId];
  const searchClause = search
    ? (() => { queryParams.push(`%${search}%`); return `AND c.name ILIKE $${queryParams.length}`; })()
    : "";

  const result = await pool.query<{ id: number; nome: string; empresa_id: number }>(
    `
    WITH
    prot_recente AS (
      SELECT DISTINCT ON (client_id)
        id AS protocolo_id, client_id,
        status AS protocolo_status,
        start_date AS protocolo_inicio,
        title AS protocolo_titulo
      FROM protocols
      WHERE empresa_id = $1
      ORDER BY client_id,
        CASE WHEN status IN ('active', 'validated') THEN 1 ELSE 2 END ASC,
        created_at DESC
    ),
    ultima_sess AS (
      SELECT DISTINCT ON (s.client_id)
        s.client_id,
        s.scheduled_date AS ultima_sessao_data,
        s.status AS ultima_sessao_status
      FROM sessions s
      WHERE s.empresa_id = $1
        AND s.scheduled_date <= to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
      ORDER BY s.client_id, s.scheduled_date DESC, s.id DESC
    ),
    proxima_sess AS (
      SELECT DISTINCT ON (s.client_id)
        s.client_id,
        s.scheduled_date AS proxima_sessao_data,
        s.scheduled_time AS proxima_sessao_hora
      FROM sessions s
      WHERE s.empresa_id = $1
        AND s.status = 'scheduled'
        AND s.scheduled_date > to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
      ORDER BY s.client_id, s.scheduled_date ASC, s.id ASC
    ),
    subst_agg AS (
      SELECT
        p.client_id,
        COUNT(DISTINCT pi.substance_id) AS total_substancias,
        BOOL_OR(LOWER(s.name) LIKE '%coenzima%' OR LOWER(s.name) LIKE '%coq10%') AS tem_coenzima,
        BOOL_OR(LOWER(s.name) LIKE '%gh%' OR LOWER(s.name) LIKE '%somatropin%'
          OR LOWER(s.name) LIKE '%hormônio do crescimento%'
          OR LOWER(s.name) LIKE '%hormonio do crescimento%') AS tem_gh,
        BOOL_OR(LOWER(s.name) LIKE '%testosteron%') AS tem_testosterona
      FROM protocols p
      JOIN protocol_items pi ON pi.protocol_id = p.id
      JOIN substances s ON s.id = pi.substance_id
      WHERE p.empresa_id = $1 AND p.status IN ('active', 'validated')
      GROUP BY p.client_id
    ),
    ult_contato AS (
      SELECT DISTINCT ON (cliente_id)
        cliente_id,
        enviado_em AS ultimo_contato
      FROM mensageria_lembrete
      WHERE status = 'enviado'
        AND enviado_em IS NOT NULL
        AND empresa_id = $1
      ORDER BY cliente_id, enviado_em DESC
    )
    SELECT
      c.id,
      c.name AS nome,
      c.empresa_id
    FROM clients c
    LEFT JOIN prot_recente pr ON pr.client_id = c.id
    LEFT JOIN ultima_sess us ON us.client_id = c.id
    LEFT JOIN proxima_sess nx ON nx.client_id = c.id
    LEFT JOIN subst_agg sa ON sa.client_id = c.id
    LEFT JOIN ult_contato uc ON uc.cliente_id = c.id
    WHERE c.empresa_id = $1
      AND c.status = 'active'
      AND c.deleted_at IS NULL
      ${searchClause}
    ORDER BY c.name ASC
    `,
    queryParams,
  );

  return result.rows;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setup() {
  // Tenant A: dois clientes — um nome compartilhado, um exclusivo
  const r1 = await pool.query<{ id: number }>(
    `INSERT INTO clients (name, empresa_id, status, location_id)
     VALUES ($1, $2, 'active', 8) RETURNING id`,
    [NOME_COMPARTILHADO, TENANT_A],
  );
  clientIdA1 = r1.rows[0].id;

  const r2 = await pool.query<{ id: number }>(
    `INSERT INTO clients (name, empresa_id, status, location_id)
     VALUES ($1, $2, 'active', 8) RETURNING id`,
    [NOME_EXCLUSIVO_A, TENANT_A],
  );
  clientIdA2 = r2.rows[0].id;

  // Tenant B: um cliente com o mesmo nome compartilhado
  const r3 = await pool.query<{ id: number }>(
    `INSERT INTO clients (name, empresa_id, status, location_id)
     VALUES ($1, $2, 'active', 8) RETURNING id`,
    [NOME_COMPARTILHADO, TENANT_B],
  );
  clientIdB1 = r3.rows[0].id;

  console.log(`  [setup] Tenant A (${TENANT_A}): ids ${clientIdA1}, ${clientIdA2}`);
  console.log(`  [setup] Tenant B (${TENANT_B}): id  ${clientIdB1}`);
}

// ── Teardown ──────────────────────────────────────────────────────────────────

async function teardown() {
  await pool.query(
    `DELETE FROM clients WHERE id = ANY($1::int[])`,
    [[clientIdA1, clientIdA2, clientIdB1].filter((id) => id > 0)],
  );
  console.log("  [teardown] clientes de teste removidos");
}

// ── Testes ────────────────────────────────────────────────────────────────────

type Assertion = { desc: string; pass: boolean; detail?: string };
const results: Assertion[] = [];

function assert(desc: string, cond: boolean, detail?: string) {
  results.push({ desc, pass: cond, detail });
  const mark = cond ? "✓" : "✗";
  if (!cond) console.error(`  ${mark} FALHOU: ${desc}${detail ? ` — ${detail}` : ""}`);
  else       console.log( `  ${mark} ${desc}`);
}

async function runTests() {
  const searchTerm = SUFIXO.replace(/^_/, ""); // remove underscore inicial para busca

  // ── Teste 1: sem search → cada tenant vê só os seus ─────────────────────────
  console.log("\n[Teste 1] Sem search: cada tenant retorna apenas seus próprios clientes");
  const t1A = await queryRadar(TENANT_A, null);
  const t1B = await queryRadar(TENANT_B, null);

  const idsEmA_de_B = t1A.filter((r) => r.empresa_id === TENANT_B).map((r) => r.id);
  const idsEmB_de_A = t1B.filter((r) => r.empresa_id === TENANT_A).map((r) => r.id);

  assert("Tenant A não contém clientes do Tenant B", idsEmA_de_B.length === 0,
    idsEmA_de_B.length > 0 ? `ids vazados: ${idsEmA_de_B}` : undefined);
  assert("Tenant B não contém clientes do Tenant A", idsEmB_de_A.length === 0,
    idsEmB_de_A.length > 0 ? `ids vazados: ${idsEmB_de_A}` : undefined);
  assert("Tenant A retorna clientIdA1", t1A.some((r) => r.id === clientIdA1));
  assert("Tenant A retorna clientIdA2", t1A.some((r) => r.id === clientIdA2));
  assert("Tenant B retorna clientIdB1", t1B.some((r) => r.id === clientIdB1));

  // ── Teste 2: search pelo nome compartilhado ──────────────────────────────────
  console.log("\n[Teste 2] search=nomeParcial → cada tenant vê só o seu");
  const t2A = await queryRadar(TENANT_A, NOME_COMPARTILHADO.slice(0, 6)); // ex: "Beatri"
  const t2B = await queryRadar(TENANT_B, NOME_COMPARTILHADO.slice(0, 6));

  assert("Busca no Tenant A retorna clientIdA1 (nome compartilhado)", t2A.some((r) => r.id === clientIdA1));
  assert("Busca no Tenant A NÃO retorna clientIdB1 (mesmo nome, outro tenant)", !t2A.some((r) => r.id === clientIdB1));
  assert("Busca no Tenant B retorna clientIdB1", t2B.some((r) => r.id === clientIdB1));
  assert("Busca no Tenant B NÃO retorna clientIdA1 (mesmo nome, outro tenant)", !t2B.some((r) => r.id === clientIdA1));

  // ── Teste 3: total filtrado corretamente ─────────────────────────────────────
  console.log("\n[Teste 3] Total (length) reflete apenas o tenant correto");
  // Tenant A tem 2 clientes com o sufixo; Tenant B tem 1.
  const t3A = await queryRadar(TENANT_A, searchTerm);
  const t3B = await queryRadar(TENANT_B, searchTerm);

  assert(`Tenant A total para search="${searchTerm}" = 2`, t3A.length === 2,
    `obtido: ${t3A.length}`);
  assert(`Tenant B total para search="${searchTerm}" = 1`, t3B.length === 1,
    `obtido: ${t3B.length}`);
  // Garantia extra: nenhuma linha tem empresa_id errado
  assert("Nenhuma linha do Tenant A tem empresa_id ≠ TENANT_A",
    t3A.every((r) => r.empresa_id === TENANT_A));
  assert("Nenhuma linha do Tenant B tem empresa_id ≠ TENANT_B",
    t3B.every((r) => r.empresa_id === TENANT_B));

  // ── Teste 4: busca pelo nome exclusivo do Tenant A não aparece no B ──────────
  console.log("\n[Teste 4] Nome exclusivo do Tenant A invisível para Tenant B");
  const t4A = await queryRadar(TENANT_A, NOME_EXCLUSIVO_A.slice(0, 6)); // ex: "Carlos"
  const t4B = await queryRadar(TENANT_B, NOME_EXCLUSIVO_A.slice(0, 6));

  assert("Tenant A vê clientIdA2 (exclusivo)", t4A.some((r) => r.id === clientIdA2));
  assert("Tenant B NÃO vê clientIdA2 (exclusivo do A)", !t4B.some((r) => r.id === clientIdA2));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Teste de isolamento multi-tenant do Radar Clínico ===\n");
  console.log(`Tenant A = empresa_id ${TENANT_A} | Tenant B = empresa_id ${TENANT_B}`);

  try {
    await setup();
    await runTests();
  } finally {
    await teardown();
    await pool.end();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== Resultado: ${results.length - failed.length}/${results.length} passou ===`);

  if (failed.length > 0) {
    console.error("\nFalhas:");
    failed.forEach((f) => console.error(`  ✗ ${f.desc}${f.detail ? ` — ${f.detail}` : ""}`));
    process.exit(1);
  } else {
    console.log("Todos os testes passaram. Isolamento multi-tenant confirmado.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Erro inesperado:", err);
  process.exit(1);
});
