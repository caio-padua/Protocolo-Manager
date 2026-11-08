import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export async function ensureAgendaIntegrationSchema() {
  await db.execute(sql`
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS duration_minutes integer;
    CREATE TABLE IF NOT EXISTS agenda_google_sync (
      location_id integer PRIMARY KEY REFERENCES locations(id),
      cursor text,
      last_success timestamptz,
      last_attempt timestamptz,
      error text,
      enabled boolean NOT NULL DEFAULT true
    );
    CREATE TABLE IF NOT EXISTS agenda_google_source (
      location_id integer NOT NULL REFERENCES locations(id),
      event_id text NOT NULL,
      body jsonb NOT NULL,
      PRIMARY KEY(location_id,event_id)
    );
    CREATE TABLE IF NOT EXISTS agenda_personal_owners (
      location_id integer PRIMARY KEY REFERENCES locations(id),
      professional_id integer NOT NULL,
      empresa_id integer NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agenda_change_requests (
      id serial PRIMARY KEY,
      empresa_id integer NOT NULL,
      resource_id integer NOT NULL,
      requested_by integer NOT NULL,
      reason text NOT NULL,
      before_windows jsonb NOT NULL,
      proposed_windows jsonb NOT NULL,
      state text NOT NULL DEFAULT 'pendente',
      decided_by integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      decided_at timestamptz
    )
  `);
  await db.execute(sql`ALTER TABLE agenda_google_sync ADD COLUMN IF NOT EXISTS source_calendar_id text`);
  // Vínculos operacionais conferidos na carga autorizada; não inferir pelo título.
  // Executado apenas na primeira ativação desta agenda, nunca refaz seleção do usuário.
  await db.execute(sql`
    INSERT INTO agenda_personal_owners(location_id,professional_id,empresa_id)
    SELECT l.id,p.id,l.empresa_id FROM locations l JOIN professionals p ON p.id=6
    WHERE l.id=37 AND l.empresa_id=5 AND l.agenda_papel='pessoal'
      AND p.active AND p.is_platform_owner
      AND NOT EXISTS(SELECT 1 FROM agenda_google_sync WHERE location_id=37)
    ON CONFLICT(location_id) DO NOTHING;
    INSERT INTO agenda_google_sync(location_id)
    SELECT id FROM locations WHERE empresa_id=5 AND id BETWEEN 30 AND 39
      AND google_calendar_id IS NOT NULL AND active='true'
    ON CONFLICT(location_id) DO NOTHING
  `);
}
