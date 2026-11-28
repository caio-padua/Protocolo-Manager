import type { Pool } from "pg";

export type AmbienteCredito = "real" | "teste";

/** Política de segurança do servidor, nunca uma escolha enviada pelo navegador. */
export function ambienteCreditoAtual(): AmbienteCredito {
  return process.env.NODE_ENV === "production" ? "real" : "teste";
}

export function validarAmbienteCredito(ambiente: AmbienteCredito): AmbienteCredito {
  if (ambiente !== "real" && ambiente !== "teste") throw new RangeError("ambiente de crédito inválido");
  return ambiente;
}

/**
 * Migração aditiva e transacional. Nenhum saldo é recalculado ou transferido.
 * Um histórico legado que já misturou crédito de teste exige conciliação humana.
 */
export async function migrarCreditoPorAmbiente(pool: Pool): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(7790003)");
    await c.query(`CREATE TABLE IF NOT EXISTS msg_migracoes (codigo TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const separada = await c.query(`SELECT 1 FROM msg_migracoes WHERE codigo = 'credito_por_ambiente'`);
    if (!separada.rowCount) {
      const legado = await c.query(`SELECT 1 FROM msg_recargas WHERE ambiente = 'teste' AND status = 'confirmada' LIMIT 1`);
      if (legado.rowCount) {
        throw new Error("Crédito legado exige conciliação: existem recargas de teste confirmadas sem migração de ambiente comprovada. Nenhum saldo foi alterado.");
      }
    }
    const tabelas = ["msg_carteira", "msg_tarifas", "msg_extrato", "msg_eventos_pendentes", "msg_avisos", "msg_custos_provedor", "msg_franquia_uso"];
    for (const tabela of tabelas) {
      const existe = await c.query("SELECT to_regclass($1) AS tabela", [tabela]);
      if (!existe.rows[0]?.tabela) continue;
      // O padrão só classifica dados legados; novas gravações precisam declarar o ambiente.
      await c.query(`ALTER TABLE ${tabela} ADD COLUMN IF NOT EXISTS ambiente TEXT NOT NULL DEFAULT 'real' CHECK (ambiente IN ('real','teste'))`);
      await c.query(`ALTER TABLE ${tabela} ALTER COLUMN ambiente DROP DEFAULT`);
    }
    if ((await c.query(`SELECT to_regclass('msg_eventos_pendentes') AS tabela`)).rows[0]?.tabela) {
      await c.query(`ALTER TABLE msg_eventos_pendentes ADD COLUMN IF NOT EXISTS retomada_em TIMESTAMPTZ`);
    }
    const chaves = [
      { tabela: "msg_carteira", antigas: ["empresa_id"], novas: ["empresa_id", "ambiente"], primaria: true },
      { tabela: "msg_extrato", antigas: ["empresa_id", "chave"], novas: ["empresa_id", "ambiente", "chave"], primaria: false },
      { tabela: "msg_eventos_pendentes", antigas: ["empresa_id", "chave"], novas: ["empresa_id", "ambiente", "chave"], primaria: false },
      { tabela: "msg_custos_provedor", antigas: ["empresa_id", "chave"], novas: ["empresa_id", "ambiente", "chave"], primaria: false },
      { tabela: "msg_franquia_uso", antigas: ["empresa_id", "mes"], novas: ["empresa_id", "ambiente", "mes"], primaria: true },
      { tabela: "msg_recargas", antigas: ["provedor_ref"], novas: ["ambiente", "provedor_ref"], primaria: false },
    ];
    for (const chave of chaves) {
      const existe = await c.query("SELECT to_regclass($1) AS tabela", [chave.tabela]);
      if (!existe.rows[0]?.tabela) continue;
      const constraints = await c.query(`SELECT con.conname,
          ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ordem)
            JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum ORDER BY k.ordem) AS colunas
        FROM pg_constraint con WHERE con.conrelid = $1::regclass AND con.contype IN ('p','u')`, [chave.tabela]);
      for (const constraint of constraints.rows) {
        if (JSON.stringify(constraint.colunas) === JSON.stringify(chave.antigas)) {
          const nome = String(constraint.conname).replaceAll('"', '""');
          await c.query(`ALTER TABLE ${chave.tabela} DROP CONSTRAINT "${nome}"`);
        }
      }
      if (!constraints.rows.some((x) => JSON.stringify(x.colunas) === JSON.stringify(chave.novas))) {
        await c.query(`ALTER TABLE ${chave.tabela} ADD CONSTRAINT ${chave.tabela}_ambiente_${chave.primaria ? "pkey" : "unique"}
          ${chave.primaria ? "PRIMARY KEY" : "UNIQUE"} (${chave.novas.join(", ")})`);
      }
    }
    await c.query(`INSERT INTO msg_migracoes (codigo) VALUES ('credito_por_ambiente') ON CONFLICT DO NOTHING`);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
