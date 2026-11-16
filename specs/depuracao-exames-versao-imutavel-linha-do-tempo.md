# Levantamento P3 — Versão imutável por extração e linha do tempo por etapa

Data: 16/11/2026. Estado: SOMENTE LEVANTAMENTO. Nenhuma migração criada. Não homologado, não publicado.

## 1. O que existe hoje
| Item | Situação verificada |
|---|---|
| Versão imutável por extração | Não existe. `exam_documents.raw_json` e `exam_results` guardam só a última leitura |
| Reprocessamento | Hoje RECUSADO (409, `rejectUnversionedReprocessing`): evita apagar histórico |
| Linha do tempo por etapa | Não existe unificada. Há `/exames-lab/auditoria` e `/identidade/historico` (este é append-only) |
| Reaproveitável | `exam_identity_checks` (append-only, gatilho recusa UPDATE/DELETE), `llm_pipeline`, `reconciliation.ts` (testado, sem uso) |
| Cadeia de IA | Gemini, depois Claude, depois OpenAI em série via `mergeExtractions`; sem auditor independente |
| Custo por clínica | Não existe relatório; só marca `empresa_id` no gateway |

## 2. Proposta aditiva e reversível (a validar com o Dr. Caio antes de criar)
2.1 Tabela nova `exam_extraction_versions`: id, document_id, empresa_id, version_no, stage, model, payload_json, payload_sha256, created_at. Índice único (document_id, version_no). Gatilho que recusa UPDATE e DELETE (mesmo padrão de `exam_identity_checks`).
2.2 Tabela nova `exam_pipeline_events`: document_id, empresa_id, stage (ingestao, identidade, leitura, conferencia_1, conferencia_2, incorporacao), version_no, actor, at, detail. Append-only.
2.3 Reprocessar passa a CRIAR versão nova; `exam_results` ativos apontam para a versão vigente; versões antigas permanecem. Nunca apaga.
2.4 Reversão: remover as duas tabelas e o gatilho não afeta nenhuma tabela atual (nada é alterado nas existentes).
2.5 Toda leitura filtra por `empresa_id` da sessão (mesmo contrato provado em `exam-lab-rotas-isolamento-postgres.test.ts`).

## 3. Riscos
| Risco | Barreira prevista |
|---|---|
| Versão antiga vazar para outra clínica | empresa_id obrigatório + teste de ataque cruzado |
| Reprocessar apagar resultados conferidos | proibido por desenho; resultados conferidos exigem nova conferência |
| Payload com CPF completo na trilha | gravar hash e campos mascarados |

## 4. Plano dependente
1. Histórico imutável + linha do tempo (2.1 a 2.5).
2. Gemini e OpenAI independentes (em paralelo, sem encadear) com Claude como auditor.
3. Métricas de qualidade e custo por clínica.
Cada passo só começa após a aprovação do anterior.
