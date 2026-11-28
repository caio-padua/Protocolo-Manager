// Estrutura aditiva. Não cria áreas nem altera profissionais existentes.
export const PROFESSIONAL_WORK_AREAS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS professional_work_areas (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INTEGER NOT NULL REFERENCES professionals(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS professional_work_area_links (
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    professional_id INTEGER NOT NULL REFERENCES professionals(id),
    work_area_id INTEGER NOT NULL REFERENCES professional_work_areas(id),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (empresa_id, professional_id, work_area_id)
  );
  CREATE TABLE IF NOT EXISTS professional_work_area_history (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    professional_id INTEGER NOT NULL REFERENCES professionals(id),
    work_area_id INTEGER NOT NULL REFERENCES professional_work_areas(id),
    actor_id INTEGER NOT NULL REFERENCES professionals(id),
    active BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS professional_category_history (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES professional_areas(id),
    actor_id INTEGER NOT NULL REFERENCES professionals(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;
