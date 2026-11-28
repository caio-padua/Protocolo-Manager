-- Niveis de relacionamento do cliente: Prata, Ouro, Platinum e Diamond (decisao do CEO, 14/11/2026).
-- Entrada do cliente = prata. Esta migracao NAO reclassifica por nome parecido.
--
-- Valores validos antes desta migracao (contrato OpenAPI de 13/11/2026): bronze, prata, ouro, rodio.
-- Equivalencia segura (unica): bronze -> prata. Bronze era a porta de entrada e o padrao de todos os
-- clientes; prata e a nova porta de entrada.
-- Sem equivalencia segura: prata, ouro e rodio (e qualquer outro valor fora do modelo). "prata" e "ouro"
-- antigos coincidem em NOME com os novos, mas ocupam outra posicao na hierarquia. Estes clientes
-- ficam com o valor preservado e MARCADO como pendente: plano = 'legado:<valor anterior>'.
-- Nenhum nivel e inventado; a equipe escolhe o nivel novo no cadastro do cliente.
-- Valores platinum/diamond nunca existiram antes; se aparecerem, nao sao tocados.
--
-- Execucao unica: o livro cliente_nivel_migracao registra cada linha alterada (base do rollback e da lista
-- de pendencias) e, por existir, impede que uma segunda execucao reinterprete "prata" ja novo como antigo.
-- Reverter: scripts/migrations/rollback/20261125_cliente_plano_niveis.down.sql (nao entra em migrations.sql).
-- Nao altera classificacao, empresa, vinculos, protocolos, sessoes nem historico: so a coluna clients.plano.
ALTER TABLE clients ALTER COLUMN plano SET DEFAULT 'prata';

DO $mig$
BEGIN
  IF to_regclass('cliente_nivel_migracao') IS NOT NULL THEN
    RAISE NOTICE 'cliente_nivel_migracao ja existe: conversao de niveis ja executada, nada a fazer';
    RETURN;
  END IF;

  CREATE TABLE cliente_nivel_migracao (
    client_id      integer PRIMARY KEY,
    empresa_id     integer,
    plano_anterior text NOT NULL,
    plano_novo     text NOT NULL,
    motivo         text NOT NULL,
    migrado_em     timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX cliente_nivel_migracao_empresa_idx ON cliente_nivel_migracao (empresa_id);

  INSERT INTO cliente_nivel_migracao (client_id, empresa_id, plano_anterior, plano_novo, motivo)
  SELECT id, empresa_id, plano,
         CASE WHEN plano = 'bronze' THEN 'prata' ELSE 'legado:' || plano END,
         CASE WHEN plano = 'bronze' THEN 'entrada_bronze_para_prata'
              ELSE 'sem_equivalencia_segura_preservado' END
    FROM clients
   WHERE plano NOT IN ('platinum', 'diamond');

  UPDATE clients c
     SET plano = m.plano_novo
    FROM cliente_nivel_migracao m
   WHERE m.client_id = c.id;
END
$mig$;
