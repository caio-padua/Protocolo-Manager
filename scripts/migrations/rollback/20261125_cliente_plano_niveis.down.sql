-- ROLLBACK da migracao 20261125_cliente_plano_niveis.sql. Execucao manual e explicita; nunca entra em migrations.sql.
-- Restaura o valor anterior (bronze, prata, ouro, rodio...) SOMENTE nos clientes cujo plano ainda e o que a
-- migracao gravou. Quem foi alterado depois (por exemplo, a equipe escolheu um nivel novo) nao e sobrescrito:
-- continua como esta, e o livro mantem a linha dele para conferencia.
-- Se todas as linhas voltarem, o livro e removido e a migracao pode ser executada de novo.
BEGIN;

ALTER TABLE clients ALTER COLUMN plano SET DEFAULT 'bronze';

DO $down$
DECLARE
  restaurados integer;
  restantes   integer;
BEGIN
  IF to_regclass('cliente_nivel_migracao') IS NULL THEN
    RAISE NOTICE 'cliente_nivel_migracao nao existe: nada a reverter';
    RETURN;
  END IF;

  UPDATE clients c
     SET plano = m.plano_anterior
    FROM cliente_nivel_migracao m
   WHERE m.client_id = c.id AND c.plano = m.plano_novo;
  GET DIAGNOSTICS restaurados = ROW_COUNT;

  DELETE FROM cliente_nivel_migracao m
   USING clients c
   WHERE m.client_id = c.id AND c.plano = m.plano_anterior;

  SELECT count(*) INTO restantes FROM cliente_nivel_migracao;
  IF restantes = 0 THEN
    DROP TABLE cliente_nivel_migracao;
    RAISE NOTICE 'rollback completo: % clientes restaurados, livro removido', restaurados;
  ELSE
    RAISE NOTICE 'rollback parcial: % restaurados; % clientes alterados depois da migracao foram mantidos e o livro foi preservado', restaurados, restantes;
  END IF;
END
$down$;

COMMIT;
