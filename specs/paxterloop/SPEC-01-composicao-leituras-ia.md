# SPEC 1 — Composição segura das leituras de IA (exames)

Estado: TESTADO (BANCO + MOCK). Não HOMOLOGADO. Data: 16/11/2026.

## 1. Objetivo
Quando mais de uma IA lê o mesmo laudo, preservar o que só uma achou e nunca escolher uma leitura quando elas divergem.

## 2. Estado inicial e evidências
- `mergeExtractions` (routes/exames-lab.ts) mantinha só os campos da primeira IA: laboratório e data encontrados apenas por Claude/OpenAI eram perdidos.
- Valores, unidades e paciente divergentes não eram detectados: a primeira leitura vencia em silêncio.
- `reconcileExamCandidates` existia, testada, mas sem uso no pipeline, e escolhe o primeiro valor mesmo com conflito.

## 3. Escopo
Dentro: composição das leituras, trilha, retenção por divergência de paciente. Fora: tela de revisão de conflitos, chamadas reais de IA, mudança de provedores, reprocessamento.

## 4. Requisitos
Funcionais: R1 união de analitos por nome normalizado, preservando unidade e faixa de quem as trouxe. R2 data e laboratório preservados quando só uma IA os traz. R3 divergência de data, laboratório ou paciente deixa o campo vazio e registra todas as candidatas. R4 divergência de valor ou unidade retira o analito do resultado e o lista na trilha. R5 divergência de nome, CPF ou nascimento retém o documento em quarentena. R6 trilha registra fonte por campo e confiança por IA.
Não funcionais: leitura única mantém o comportamento anterior; nenhuma chamada nova a IA; comparação ignora caixa e espaços (unidade) e pontuação do CPF.
Segurança: clínica sempre vem do cliente e da sessão; o resultado só é lido pelas rotas já protegidas.

## 5. Critérios de aceitação
Os 4 testes abaixo passam; os testes anteriores de exames, identidade e isolamento continuam verdes; `tsc` sem erro.

## 6. Implementação (arquivos)
- `lib/exam-extraction/reconciliation.ts`: nova `composeExamCandidates` (a função antiga ficou intacta).
- `routes/exames-lab.ts`: coleta candidatos, compõe quando há 2 ou mais, grava passo `reconciliacao` em `llm_pipeline`.
- `lib/exam-extraction/identity-gate.ts`: opção `forceQuarantineReason`.
- Sem migração de banco: usa a coluna `llm_pipeline` existente.

## 7. Casos de teste e resultado
Arquivo: `artifacts/api-server/src/tests/exam-extraction-composicao-postgres.test.ts` (IA simulada, banco descartável).

| Caso | Tipo de prova | Resultado |
|---|---|---|
| Complementar: laboratório, data e analitos vindos de IAs diferentes, com fonte | BANCO + MOCK | Passou |
| Três respostas contraditórias e incompletas: data e laboratório vazios, glicose e TSH retirados, ureia (só caixa da unidade difere) mantida | BANCO + MOCK | Passou |
| CPF divergente entre IAs: quarentena, zero resultados, sem Drive | BANCO + MOCK | Passou |
| Isolamento: clínica 5 recebe 404 no documento da clínica 6 | BANCO + MOCK | Passou |

Regressão: `exam-extraction-safety`, `exam-identity-tenant-postgres`, `exam-lab-rotas-isolamento-postgres` e a nova: 4 arquivos, 123 testes, 0 falhas; `tsc --noEmit` limpo.
Comando: `cd artifacts/api-server && pnpm exec vitest run src/tests/exam-extraction-composicao-postgres.test.ts src/tests/exam-extraction-safety.test.ts src/tests/exam-identity-tenant-postgres.test.ts src/tests/exam-lab-rotas-isolamento-postgres.test.ts`

## 8. Riscos e limitações
- IA real (Gemini, Claude, OpenAI) NÃO foi chamada: comportamento com respostas reais não comprovado.
- Conflitos ficam só na trilha (`llm_pipeline`); nenhuma tela os mostra ainda.
- Analito retirado por conflito não aparece no prontuário até haver tela de revisão: é decisão conservadora, mas pode esconder dado.
- Em documento retido, a trilha fica em `exam_identity_checks`, não em `exam_documents`.
- Cada IA ainda é chamada em série, não independente (plano posterior).

## 9. Checkpoint
Realizado: SPEC 1 implementada e testada. Evidência: seção 7. Pendências: tela de conflitos; prova com IA real (precisa autorização de custo). Próxima SPEC: 2.
