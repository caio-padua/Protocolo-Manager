-- Padrão de horário da enfermagem para TODAS as agendas ativas (pedido do CEO, 11/11/2026).
-- Modelo = janelas da agenda "AGENDA ENFERMAGEM - LOCAL" (id 23). Duração: enfermagem mantém o que tem;
-- agenda médica = 60 minutos. Aditivo e idempotente: só copia para agenda ATIVA que ainda NÃO tem nenhuma janela;
-- nunca altera nem apaga janela existente.
BEGIN;

INSERT INTO agenda_windows (resource_id, weekday, start_time, end_time, repeat_weeks, anchor_date, active)
SELECT r.id, m.weekday, m.start_time, m.end_time, m.repeat_weeks, m.anchor_date, true
FROM agenda_resources r
CROSS JOIN agenda_windows m
WHERE m.resource_id = 23 AND m.active
  AND r.active
  AND r.kind IN ('enfermagem', 'medico')
  AND r.id <> 23
  AND NOT EXISTS (SELECT 1 FROM agenda_windows w WHERE w.resource_id = r.id);

UPDATE agenda_resources SET slot_minutes = 60 WHERE kind = 'medico' AND slot_minutes IS DISTINCT FROM 60;

COMMIT;
