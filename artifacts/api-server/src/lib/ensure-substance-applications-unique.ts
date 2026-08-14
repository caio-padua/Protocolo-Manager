/**
 * Migração de boot idempotente — Task 277.
 *
 * Impede que uma linha DUPLICADA de aplicação inflacione a contagem de
 * sessões feitas: o banco passa a recusar duas linhas iguais para a mesma
 * sessão + mesma substância + mesmo número de sessão.
 *
 * Por que session_number faz parte da chave: a consolidação semanal
 * (POST /protocols/:id/validate) cria UMA sessão por semana e insere uma linha
 * de aplicação POR OCORRÊNCIA agendada. Com intervalDays < 7 a mesma
 * substância aparece legitimamente mais de uma vez na mesma sessão — cada
 * ocorrência com sessionNumber distinto. Essas linhas são válidas e NÃO podem
 * ser bloqueadas nem apagadas. A duplicata que inflaciona contagem é a linha
 * EXATAMENTE igual (mesma sessão, substância e número de sessão).
 *
 * Passos (Regra de Ouro: só ADICIONAR — nenhuma linha clínica legítima some):
 *  1. Remove um índice 2-colunas anterior desta mesma task, se existir
 *     (nunca chegou a produção; bloquearia o fluxo sub-semanal válido).
 *  2. Deduplica linhas EXATAMENTE iguais no trio (mantém a de menor id).
 *  3. Cria índice único em (session_id, substance_id, session_number).
 *
 * Padrão idêntico ao ensurePesquisasSchema: roda ANTES do app.listen().
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

let _ready: Promise<void> | null = null;

export async function ensureSubstanceApplicationsUnique(): Promise<void> {
  if (!_ready) {
    _ready = (async () => {
      // 1. Índice 2-colunas da primeira iteração desta task (dev-only):
      //    incompatível com o fluxo sub-semanal — precisa sair antes do novo.
      await db.execute(sql`
        DROP INDEX IF EXISTS substance_applications_session_substance_uidx
      `);

      // 2. Remove só duplicatas EXATAS do trio, preservando a linha mais
      //    antiga (menor id). Linhas legítimas (sessionNumber distinto) ficam.
      //    Idempotente: sem duplicatas, é no-op.
      await db.execute(sql`
        DELETE FROM substance_applications a
        USING substance_applications b
        WHERE a.session_id = b.session_id
          AND a.substance_id = b.substance_id
          AND a.session_number = b.session_number
          AND a.id > b.id
      `);

      // 3. Índice único — o banco recusa a duplicata exata na origem.
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS substance_applications_session_substance_num_uidx
          ON substance_applications (session_id, substance_id, session_number)
      `);
    })();
  }
  return _ready;
}
