-- Operação única autorizada no ambiente de desenvolvimento.
-- Não incluir em inicialização nem em migrações automáticas.
BEGIN;
LOCK TABLE clients, client_clinic_agenda_defaults, agenda_resources, locations, empresas IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE
  enfermagem_id integer;
  medico_id integer;
  alterados integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM empresas WHERE id = 5 AND nome = 'Instituto Padua' AND ativa = true) THEN
    RAISE EXCEPTION 'Instituto Pádua ativo não corresponde à clínica esperada.';
  END IF;
  IF EXISTS (SELECT 1 FROM client_clinic_agenda_defaults WHERE empresa_id = 5) THEN
    RAISE EXCEPTION 'Padrões já configurados; operação única não será repetida.';
  END IF;
  SELECT min(r.id) INTO enfermagem_id FROM agenda_resources r
    JOIN locations l ON l.id = r.location_id
    WHERE l.empresa_id = 5 AND l.active = 'true' AND r.active = true
      AND r.kind = 'enfermagem' AND r.name = 'AGENDA ENFERMAGEM - LOCAL'
    HAVING count(*) = 1;
  SELECT min(r.id) INTO medico_id FROM agenda_resources r
    JOIN locations l ON l.id = r.location_id
    WHERE l.empresa_id = 5 AND l.active = 'true' AND r.active = true
      AND r.kind = 'medico' AND r.name = 'AGENDA MEDICO - CAIO PADUA - LOCAL'
    HAVING count(*) = 1;
  IF enfermagem_id IS NULL OR medico_id IS NULL THEN
    RAISE EXCEPTION 'As duas agendas locais não foram identificadas de forma única e ativa.';
  END IF;
  INSERT INTO client_clinic_agenda_defaults (empresa_id, enfermagem_resource_id, medico_resource_id)
    VALUES (5, enfermagem_id, medico_id);
  UPDATE clients SET
    agenda_enfermagem_padrao_id = COALESCE(agenda_enfermagem_padrao_id, enfermagem_id),
    agenda_medico_padrao_id = COALESCE(agenda_medico_padrao_id, medico_id)
  WHERE empresa_id = 5 AND clinica_origem_empresa_id = 5
    AND (agenda_enfermagem_padrao_id IS NULL OR agenda_medico_padrao_id IS NULL);
  GET DIAGNOSTICS alterados = ROW_COUNT;
  RAISE NOTICE 'Clientes preenchidos sem sobrescrever escolhas: %', alterados;
END $$;
COMMIT;
