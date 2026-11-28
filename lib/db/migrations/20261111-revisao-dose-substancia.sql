-- Migração aditiva para aplicação explícita após verificação no ambiente.
-- Não executar na inicialização do servidor nem durante a publicação.
BEGIN;

ALTER TABLE substances ADD COLUMN IF NOT EXISTS revisao_dose BIGINT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION paxter_revisao_dose_substancia() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revisao_dose < OLD.revisao_dose THEN
    RAISE EXCEPTION 'A revisão de dose não pode diminuir';
  END IF;
  IF NEW.default_dose IS DISTINCT FROM OLD.default_dose
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.concentration_mg IS DISTINCT FROM OLD.concentration_mg
     OR NEW.volume_ampola IS DISTINCT FROM OLD.volume_ampola
     OR NEW.presentation_quantity IS DISTINCT FROM OLD.presentation_quantity
     OR NEW.presentation_unit IS DISTINCT FROM OLD.presentation_unit
     OR NEW.is_blend IS DISTINCT FROM OLD.is_blend
     OR NEW.ampoule_volume_ml IS DISTINCT FROM OLD.ampoule_volume_ml THEN
    NEW.revisao_dose := GREATEST(NEW.revisao_dose, OLD.revisao_dose + 1);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION paxter_revisao_dose_componentes() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ids INTEGER[];
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    ids := ARRAY[NEW.substance_id];
  ELSIF TG_OP = 'DELETE' THEN
    ids := ARRAY[OLD.substance_id];
  ELSE
    ids := ARRAY[OLD.substance_id, NEW.substance_id];
  END IF;
  -- A mesma ordem é usada mesmo quando um componente troca de apresentação.
  -- Não bloquear verificações de chave estrangeira que só exigem KEY SHARE.
  PERFORM id FROM substances WHERE id = ANY(ids) ORDER BY id FOR NO KEY UPDATE;
  UPDATE substances SET revisao_dose = revisao_dose + 1 WHERE id = ANY(ids);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'substances'::regclass
             AND tgname = 'paxter_revisao_dose_substancia' AND NOT tgisinternal
             AND (tgtype <> 19 OR tgenabled NOT IN ('O','A')
                  OR tgfoid <> 'paxter_revisao_dose_substancia()'::regprocedure)) THEN
    RAISE EXCEPTION 'Gatilho de revisão da substância possui definição inesperada';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'substance_blend_components'::regclass
             AND tgname = 'paxter_revisao_dose_componentes' AND NOT tgisinternal
             AND (tgtype <> 31 OR tgenabled NOT IN ('O','A')
                  OR tgfoid <> 'paxter_revisao_dose_componentes()'::regprocedure)) THEN
    RAISE EXCEPTION 'Gatilho de revisão dos componentes possui definição inesperada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'substances'::regclass
                 AND tgname = 'paxter_revisao_dose_substancia' AND NOT tgisinternal) THEN
    CREATE TRIGGER paxter_revisao_dose_substancia
      BEFORE UPDATE ON substances FOR EACH ROW EXECUTE FUNCTION paxter_revisao_dose_substancia();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'substance_blend_components'::regclass
                 AND tgname = 'paxter_revisao_dose_componentes' AND NOT tgisinternal) THEN
    CREATE TRIGGER paxter_revisao_dose_componentes
      BEFORE INSERT OR UPDATE OR DELETE ON substance_blend_components
      FOR EACH ROW EXECUTE FUNCTION paxter_revisao_dose_componentes();
  END IF;
END;
$$;

COMMIT;
