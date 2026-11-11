-- Religa registros legados a clinica correta (empresa do cliente) sem apagar nada.
-- Idempotente: a segunda execucao nao encontra mais linhas para mudar.
-- protocols.unit / sessions.unit = local operacional da visita; precisa ser a clinica ou um local da MESMA empresa.
BEGIN;

CREATE TABLE IF NOT EXISTS unidade_religacao_auditoria (
  id serial PRIMARY KEY,
  tabela text NOT NULL,
  registro_id integer NOT NULL,
  campo text NOT NULL,
  valor_anterior text,
  valor_novo text,
  motivo text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- 1) empresa_id nulo: herdar do cliente (protocolo) / protocolo (sessao) / profissional (agenda sem local).
WITH alvo AS (
  SELECT p.id, c.empresa_id AS novo FROM protocols p JOIN clients c ON c.id = p.client_id
  WHERE p.empresa_id IS NULL AND c.empresa_id IS NOT NULL
), aud AS (
  INSERT INTO unidade_religacao_auditoria(tabela, registro_id, campo, valor_anterior, valor_novo, motivo)
  SELECT 'protocols', id, 'empresa_id', NULL, novo::text, 'empresa_id nulo herdado do cliente' FROM alvo RETURNING 1
)
UPDATE protocols p SET empresa_id = alvo.novo FROM alvo WHERE p.id = alvo.id;

WITH alvo AS (
  SELECT s.id, COALESCE(p.empresa_id, c.empresa_id) AS novo
  FROM sessions s LEFT JOIN protocols p ON p.id = s.protocol_id LEFT JOIN clients c ON c.id = s.client_id
  WHERE s.empresa_id IS NULL AND COALESCE(p.empresa_id, c.empresa_id) IS NOT NULL
), aud AS (
  INSERT INTO unidade_religacao_auditoria(tabela, registro_id, campo, valor_anterior, valor_novo, motivo)
  SELECT 'sessions', id, 'empresa_id', NULL, novo::text, 'empresa_id nulo herdado do protocolo/cliente' FROM alvo RETURNING 1
)
UPDATE sessions s SET empresa_id = alvo.novo FROM alvo WHERE s.id = alvo.id;

WITH alvo AS (
  SELECT r.id, pr.empresa_id AS novo FROM agenda_resources r
  JOIN professionals pr ON pr.id = r.professional_id
  WHERE r.empresa_id IS NULL AND r.location_id IS NULL AND pr.empresa_id IS NOT NULL
), aud AS (
  INSERT INTO unidade_religacao_auditoria(tabela, registro_id, campo, valor_anterior, valor_novo, motivo)
  SELECT 'agenda_resources', id, 'empresa_id', NULL, novo::text, 'empresa_id nulo herdado do profissional da agenda' FROM alvo RETURNING 1
)
UPDATE agenda_resources r SET empresa_id = alvo.novo FROM alvo WHERE r.id = alvo.id;

-- 2) unidade de OUTRA empresa -> nome da clinica (valor antigo fica na auditoria).
WITH alvo AS (
  SELECT p.id, p.unit AS antigo, e.nome AS novo FROM protocols p JOIN empresas e ON e.id = p.empresa_id
  WHERE btrim(coalesce(p.unit, '')) <> ''
    AND lower(btrim(p.unit)) <> lower(btrim(e.nome))
    AND NOT EXISTS (SELECT 1 FROM locations l WHERE l.empresa_id = p.empresa_id AND lower(btrim(l.name)) = lower(btrim(p.unit)))
), aud AS (
  INSERT INTO unidade_religacao_auditoria(tabela, registro_id, campo, valor_anterior, valor_novo, motivo)
  SELECT 'protocols', id, 'unit', antigo, novo, 'unidade de outra empresa religada a clinica do protocolo' FROM alvo RETURNING 1
)
UPDATE protocols p SET unit = alvo.novo FROM alvo WHERE p.id = alvo.id;

WITH alvo AS (
  SELECT s.id, s.unit AS antigo, e.nome AS novo FROM sessions s JOIN empresas e ON e.id = s.empresa_id
  WHERE btrim(coalesce(s.unit, '')) <> ''
    AND lower(btrim(s.unit)) <> lower(btrim(e.nome))
    AND NOT EXISTS (SELECT 1 FROM locations l WHERE l.empresa_id = s.empresa_id AND lower(btrim(l.name)) = lower(btrim(s.unit)))
), aud AS (
  INSERT INTO unidade_religacao_auditoria(tabela, registro_id, campo, valor_anterior, valor_novo, motivo)
  SELECT 'sessions', id, 'unit', antigo, novo, 'unidade de outra empresa religada a clinica da sessao' FROM alvo RETURNING 1
)
UPDATE sessions s SET unit = alvo.novo FROM alvo WHERE s.id = alvo.id;

COMMIT;
