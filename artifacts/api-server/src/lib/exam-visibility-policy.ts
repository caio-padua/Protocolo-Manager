/**
 * Política única de identidade para QUALQUER consulta que devolva resultados de exame.
 *
 * Regra: um documento cuja conferência de identidade terminou em "contradicao" ou "revisao"
 * fica fora de todo papel e de todo endpoint, até que um profissional o libere (liberacao_humana).
 * Quarentena, identidade rejeitada, erro e leitura em andamento também ficam fora.
 *
 * Documento SEM nenhuma linha de conferência (legado, anterior ao porteiro) NÃO é bloqueado aqui:
 * ele segue visível ao profissional, e o portal continua exigindo prova positiva (ver montarEvolucao).
 * A regularização dos legados é decisão separada, em lote e com aprovação.
 *
 * O interruptor de validação humana (C2) e o de resultados preliminares NÃO entram aqui:
 * nenhum deles relaxa identidade.
 */
import { sql, type SQL } from "drizzle-orm";

const STATUS_NUNCA_VISIVEIS = ["quarentena", "identidade_rejeitada", "erro", "processando", "ignorado"];

/** `docId` e `docStatus` são expressões SQL do documento (ex.: coluna do JOIN). */
export function identidadeNaoBloqueadaSql(docId: SQL, docStatus: SQL): SQL {
  return sql`(
    ${docStatus} NOT IN (${sql.join(STATUS_NUNCA_VISIVEIS.map((s) => sql`${s}`), sql`, `)})
    AND (
      NOT EXISTS (
        SELECT 1 FROM exam_identity_checks ib
        WHERE ib.document_id = ${docId}
          AND ib.event = 'verificacao'
          AND ib.verdict IN ('contradicao', 'revisao')
      )
      OR EXISTS (
        SELECT 1 FROM exam_identity_checks ih
        WHERE ih.document_id = ${docId}
          AND ih.event = 'liberacao_humana'
          AND ih.professional_id IS NOT NULL
      )
    )
  )`;
}
