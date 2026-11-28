import type { Pool } from "pg";
import type { NextFunction, Request, Response } from "express";
import { verifyPatientToken } from "./portal-token.js";
import { revogarSessoesDoCliente } from "./area-paciente-sessao.js";

// ===========================================================================
// EXCLUIR MINHA CONTA (Área do Cliente / PaxCare). Exigência da Apple App Store.
// Regra de Ouro: nada é apagado do prontuário. A exclusão ENCERRA o acesso ao aplicativo e retira os dados
// que o titular criou no aplicativo (cofre, medicações próprias, compartilhamentos, assinatura), de forma lógica
// (marca de remoção com data). Registros clínicos e fiscais permanecem na clínica pelo prazo legal.
// ===========================================================================

export const AVISO_EXCLUSAO = {
  versao: "2026-11-27",
  removidos: [
    "O seu acesso ao aplicativo (login, senha e sessões em todos os aparelhos).",
    "Os arquivos e anotações do seu cofre de saúde.",
    "Os medicamentos e suplementos que você cadastrou e os registros de Tomei/Esqueci.",
    "A autorização de cada clínica para ver os seus dados e a assinatura do aplicativo.",
  ],
  mantidos: [
    "O prontuário e os registros clínicos feitos pela clínica (consultas, prescrições, exames, documentos emitidos e anamnese). A lei exige a guarda desses registros por prazo mínimo, por isso a clínica não pode apagá-los.",
    "Registros financeiros e fiscais de serviços já prestados.",
    "Registros de segurança e auditoria (por exemplo, quando e por quem a conta foi encerrada).",
  ],
  compartilhados: [
    "O que você já autorizou uma clínica a ver deixa de ser compartilhado agora. Cópias que a clínica já guardou em seu próprio prontuário continuam com ela.",
    "Se um familiar ou outra pessoa recebeu algo seu por um vínculo, o vínculo é revogado, mas o que ela já viu ou baixou não pode ser recolhido pelo aplicativo.",
  ],
  cobrancaExterna: "Cancelar a assinatura aqui encerra o registro interno do aplicativo. Não cancela cobrança em operadora de pagamento nem cartão: se houver cobrança recorrente externa, ela precisa ser cancelada separadamente com a clínica.",
  prazosLegais: "Os prazos de guarda dos registros mantidos são definidos pela clínica e pela legislação aplicável; este aviso não informa prazo e não substitui orientação jurídica.",
  observacao: "A exclusão não pode ser desfeita pelo aplicativo. Para pedir acesso aos registros mantidos, fale com a clínica.",
} as const;

export async function criarTabelaContasExcluidas(pool: Pick<Pool, "query">): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS area_paciente_contas_excluidas (
       client_id    INTEGER PRIMARY KEY REFERENCES clients(id),
       excluida_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
       aviso_versao TEXT NOT NULL
     )`,
  );
}

export async function contaExcluida(pool: Pick<Pool, "query">, clientId: number): Promise<boolean> {
  const r = await pool.query(`SELECT 1 FROM area_paciente_contas_excluidas WHERE client_id=$1`, [clientId]);
  return r.rows.length > 0;
}

/** Tudo numa transação: ou encerra por inteiro, ou nada muda. Idempotente. */
export async function excluirContaDoApp(pool: Pool, clientId: number): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      `INSERT INTO area_paciente_contas_excluidas (client_id, aviso_versao) VALUES ($1,$2) ON CONFLICT (client_id) DO NOTHING`,
      [clientId, AVISO_EXCLUSAO.versao],
    );
    await c.query(`UPDATE paxcare_cofre_itens SET removido_em=NOW() WHERE client_id=$1 AND removido_em IS NULL`, [clientId]);
    await c.query(
      `UPDATE paxcare_vinculos SET status='revogado', comp_historico=FALSE, comp_exames=FALSE, comp_documentos=FALSE,
              revogado_em=NOW(), atualizado_em=NOW() WHERE client_id=$1 AND status='ativo'`,
      [clientId],
    );
    await c.query(`UPDATE paxcare_assinaturas SET status='cancelada', cancelado_em=NOW() WHERE client_id=$1 AND status='ativa'`, [clientId]);
    await c.query(`UPDATE cliente_medicacao_consentimentos SET revogado_em=NOW() WHERE client_id=$1 AND revogado_em IS NULL`, [clientId]);
    await c.query(`UPDATE cliente_medicacoes SET removido_em=NOW() WHERE client_id=$1 AND origem='autodeclarada' AND removido_em IS NULL`, [clientId]);
    // Credenciais do aplicativo removidas (o cadastro clínico em si permanece).
    await c.query(`UPDATE clients SET password_hash=NULL, password_set_token=NULL, password_set_token_expires_at=NULL WHERE id=$1`, [clientId]);
    await revogarSessoesDoCliente(c, clientId);
    await c.query("COMMIT");
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}

/** Token de paciente de conta excluída deixa de valer na hora (o token dura até 30 min). */
export function bloqueioContaExcluida(pool: Pick<Pool, "query">) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const a = req.headers.authorization;
    const id = a && a.startsWith("Bearer ") ? verifyPatientToken(a.slice(7)) : null;
    if (id === null) { next(); return; }
    try {
      if (await contaExcluida(pool, id)) { res.status(401).json({ error: "Esta conta foi excluída." }); return; }
    } catch (err) {
      req.log?.error({ err: String(err) }, "verificação de conta excluída falhou");
      res.status(503).json({ error: "Não foi possível verificar a sessão. Tente novamente." }); return;
    }
    next();
  };
}
