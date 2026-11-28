/**
 * Sessão persistente do cliente no celular (renovação deslizante com rotação).
 *  - O token de acesso continua curto (30 min). O "token de renovação" é opaco, aleatório (256 bits),
 *    guardado no servidor SÓ como hash SHA-256 e trocado a cada uso (rotação).
 *  - Janela deslizante: cada renovação vale mais 30 dias, com teto absoluto de 90 dias desde o login.
 *  - Reuso de um token já trocado (fora de 30 s de tolerância) revoga a família inteira (suspeita de roubo).
 *  - Nada guarda CPF, senha ou data de nascimento.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";

export const SESSAO_DESLIZANTE_DIAS = 30;
export const SESSAO_TETO_DIAS = 90;
const TOLERANCIA_CORRIDA_SEGUNDOS = 30;

const DDL = [
  `CREATE TABLE IF NOT EXISTS area_paciente_sessoes (
     id             SERIAL PRIMARY KEY,
     familia        TEXT NOT NULL,
     client_id      INTEGER NOT NULL REFERENCES clients(id),
     token_hash     TEXT NOT NULL UNIQUE,
     familia_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
     criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
     expira_em      TIMESTAMPTZ NOT NULL,
     substituido_em TIMESTAMPTZ,
     revogado_em    TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS ix_area_paciente_sessoes_familia ON area_paciente_sessoes (familia)`,
  `CREATE INDEX IF NOT EXISTS ix_area_paciente_sessoes_cliente ON area_paciente_sessoes (client_id)`,
];
export async function criarTabelaSessoes(pool: Pick<Pool, "query">): Promise<void> {
  for (const s of DDL) await pool.query(s);
}

const hashDe = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const novoToken = () => randomBytes(32).toString("base64url");

/** Abre uma família de sessão para o cliente já autenticado (token de acesso válido na rota). */
export async function iniciarSessao(pool: Pick<Pool, "query">, clientId: number): Promise<string> {
  const token = novoToken();
  await pool.query(
    `INSERT INTO area_paciente_sessoes (familia, client_id, token_hash, expira_em)
     VALUES ($1,$2,$3, now() + make_interval(days => $4))`,
    [randomUUID(), clientId, hashDe(token), SESSAO_DESLIZANTE_DIAS],
  );
  return token;
}

/** Troca o token de renovação por um novo. Retorna null quando não vale (o front pede o login de novo). */
export async function renovarSessao(pool: Pick<Pool, "query">, tokenRecebido: string): Promise<{ clientId: number; novoToken: string } | null> {
  if (typeof tokenRecebido !== "string" || tokenRecebido.length < 20 || tokenRecebido.length > 200) return null;
  const novo = novoToken();
  // Rotação atômica: só uma requisição consegue marcar o token como substituído.
  const upd = await pool.query(
    `UPDATE area_paciente_sessoes SET substituido_em = now()
      WHERE token_hash = $1 AND substituido_em IS NULL AND revogado_em IS NULL
        AND expira_em > now() AND familia_inicio + make_interval(days => $2) > now()
      RETURNING familia, client_id, familia_inicio`,
    [hashDe(tokenRecebido), SESSAO_TETO_DIAS],
  );
  const linha = upd.rows[0];
  if (!linha) {
    // Token desconhecido, expirado ou JÁ trocado. Reuso fora da tolerância revoga a família.
    await pool.query(
      `UPDATE area_paciente_sessoes SET revogado_em = now()
        WHERE revogado_em IS NULL AND familia = (
          SELECT familia FROM area_paciente_sessoes
           WHERE token_hash = $1 AND substituido_em IS NOT NULL
             AND substituido_em < now() - make_interval(secs => $2))`,
      [hashDe(tokenRecebido), TOLERANCIA_CORRIDA_SEGUNDOS],
    );
    return null;
  }
  await pool.query(
    `INSERT INTO area_paciente_sessoes (familia, client_id, token_hash, familia_inicio, expira_em)
     VALUES ($1,$2,$3,$4, LEAST(now() + make_interval(days => $5), $4::timestamptz + make_interval(days => $6)))`,
    [linha.familia, linha.client_id, hashDe(novo), linha.familia_inicio, SESSAO_DESLIZANTE_DIAS, SESSAO_TETO_DIAS],
  );
  return { clientId: Number(linha.client_id), novoToken: novo };
}

/** Sair: revoga a família do token (idempotente; não revela se existia). */
export async function encerrarSessao(pool: Pick<Pool, "query">, token: string): Promise<void> {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return;
  await pool.query(
    `UPDATE area_paciente_sessoes SET revogado_em = now()
      WHERE revogado_em IS NULL AND familia = (SELECT familia FROM area_paciente_sessoes WHERE token_hash = $1)`,
    [hashDe(token)],
  );
}

/** Troca de senha ou saída global: revoga todas as sessões persistentes do cliente. */
export async function revogarSessoesDoCliente(pool: Pick<Pool, "query">, clientId: number): Promise<void> {
  await pool.query(`UPDATE area_paciente_sessoes SET revogado_em = now() WHERE client_id=$1 AND revogado_em IS NULL`, [clientId]);
}
