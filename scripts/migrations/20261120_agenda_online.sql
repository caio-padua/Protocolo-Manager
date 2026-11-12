-- Vocabulario unico da agenda: "remoto" vira "online" (decisao do CEO, 11/11/2026). Ver specs/agenda-forma-online.md.
-- Uma transacao: constraint nova ja aceita 'online', os dados trocam, e 'remoto' deixa de ser aceito.
-- Nenhum registro e apagado, fundido ou duplicado; so o valor do papel e o sufixo do nome mudam. Idempotente.
BEGIN;
ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_agenda_papel_check;
UPDATE locations SET agenda_papel = 'online' WHERE agenda_papel = 'remoto';
UPDATE locations SET name = regexp_replace(name, '- REMOTO$', '- ONLINE') WHERE name ~ '- REMOTO$';
UPDATE agenda_resources SET name = regexp_replace(name, '- REMOTO$', '- ONLINE') WHERE name ~ '- REMOTO$';
ALTER TABLE locations ADD CONSTRAINT locations_agenda_papel_check
  CHECK (agenda_papel IS NULL OR agenda_papel IN ('local','online','externo','pessoal','geral'));
COMMIT;
