BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM evolution_conta_mensagens_identidade)
     OR EXISTS (SELECT 1 FROM evolution_conta_clinicas)
     OR EXISTS (SELECT 1 FROM evolution_conta_identidades) THEN
    RAISE EXCEPTION
      'Rollback blocked: account identities, clinic links, or captured messages exist; preserve them and roll back application code only.';
  END IF;
END
$$;

DROP TABLE evolution_conta_mensagens_identidade;
DROP TABLE evolution_conta_clinicas;
DROP TABLE evolution_conta_identidades;

COMMIT;
