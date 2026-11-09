-- Metadados de preferencia; nao criam nem alteram compromissos.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS agenda_enfermagem_padrao_id INTEGER REFERENCES agenda_resources(id);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS agenda_medico_padrao_id INTEGER REFERENCES agenda_resources(id);
CREATE TABLE IF NOT EXISTS client_clinic_agenda_defaults (
  empresa_id INTEGER PRIMARY KEY REFERENCES empresas(id),
  enfermagem_resource_id INTEGER REFERENCES agenda_resources(id),
  medico_resource_id INTEGER REFERENCES agenda_resources(id)
);
