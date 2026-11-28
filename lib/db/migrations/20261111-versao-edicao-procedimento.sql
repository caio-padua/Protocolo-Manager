-- Aplicação explícita e testada; não executar automaticamente na inicialização.
BEGIN;
ALTER TABLE procedimentos_clinicos
  ADD COLUMN IF NOT EXISTS versao_edicao BIGINT NOT NULL DEFAULT 0;

DO $$
DECLARE coluna record;
BEGIN
  SELECT data_type, is_nullable, column_default INTO coluna
  FROM information_schema.columns WHERE table_schema=current_schema()
    AND table_name='procedimentos_clinicos' AND column_name='versao_edicao';
  IF coluna.data_type <> 'bigint' OR coluna.is_nullable <> 'NO'
     OR (coluna.column_default IS NOT NULL AND coluna.column_default NOT IN ('0','0::bigint')) THEN
    RAISE EXCEPTION 'Coluna de versão de procedimento possui definição inesperada';
  END IF;
END;
$$;
ALTER TABLE procedimentos_clinicos ALTER COLUMN versao_edicao SET DEFAULT 0;

CREATE OR REPLACE FUNCTION paxter_versao_edicao_procedimento() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.versao_edicao IS DISTINCT FROM OLD.versao_edicao THEN
    RAISE EXCEPTION 'A versão de edição não pode ser modificada diretamente';
  END IF;
  IF current_setting('paxter.procedimento_versao', true) IS DISTINCT FROM
     OLD.id::text || ':' || OLD.versao_edicao::text THEN
    RAISE EXCEPTION 'Edição de procedimento sem confirmação da versão atual';
  END IF;
  NEW.versao_edicao := OLD.versao_edicao + 1;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='procedimentos_clinicos'::regclass
    AND tgname='paxter_versao_edicao_procedimento' AND NOT tgisinternal
    AND (tgtype <> 19 OR tgenabled NOT IN ('O','A')
      OR tgfoid <> 'paxter_versao_edicao_procedimento()'::regprocedure)) THEN
    RAISE EXCEPTION 'Gatilho de versão do procedimento possui definição inesperada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='procedimentos_clinicos'::regclass
    AND tgname='paxter_versao_edicao_procedimento' AND NOT tgisinternal) THEN
    CREATE TRIGGER paxter_versao_edicao_procedimento BEFORE UPDATE ON procedimentos_clinicos
      FOR EACH ROW EXECUTE FUNCTION paxter_versao_edicao_procedimento();
  END IF;
END;
$$;
COMMIT;
