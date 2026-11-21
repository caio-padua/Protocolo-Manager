-- Um unico rascunho de paciente por cliente (aditivo, idempotente).
CREATE UNIQUE INDEX IF NOT EXISTS anamnese_sessions_rascunho_paciente_unico
  ON anamnese_sessions (client_id) WHERE status = 'rascunho' AND mode = 'paciente' AND client_id IS NOT NULL;
-- Orfas (rascunho anonimo, sem resposta, parado ha mais de 7 dias) viram 'abandonada' (nada e apagado):
-- ver marcarSessoesOrfas em artifacts/api-server/src/lib/anamnese-retorno.ts
