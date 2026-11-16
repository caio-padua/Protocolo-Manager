# SPEC 2 — Fluxo de exames ponta a ponta (dados sintéticos)

Estado: TESTADO (BANCO + MOCK de IA/Drive/e-mail). Não HOMOLOGADO. Data: 16/11/2026.

## Objetivo
Provar com um laudo sintético o caminho: ingestão, leitura, verificação de identidade, padronização de unidade, conferência C1 (operacional) e C2 (clínica), evolução, falha e concorrência, sem gravar resultado incorreto.

## Estado inicial e achado
Auditoria: unidade diferente da canônica e SEM fator de conversão gravava o número cru como valor canônico e faixa na escala errada. Isso alimentava gráfico, tendência e zona com a escala errada. Correção aditiva: nesses casos `value_canonical`, `ref_low` e `ref_high` ficam nulos, o texto cru (`value_raw`, `unit_raw`) é preservado e o status é "conferencia". O mesmo vale para ponto histórico e para o reclassificador (`reassign.ts`).

## Requisitos e prova
Teste: `exam-fluxo-ponta-a-ponta-postgres.test.ts` (9 testes).

| Caso | Resultado |
|---|---|
| Glicose 5,0 mmol/L vira 90 mg/dL, converte faixa, guarda texto cru | Passou |
| Histórico em unidade canônica entra sem conversão | Passou |
| TSH em unidade sem fator: sem valor canônico, sem faixa, status conferência | Passou |
| Paciente errado: quarentena, zero resultados | Passou |
| Falha de leitura: status erro, zero resultados | Passou |
| Evolução vazia antes da conferência clínica (padrão seguro) | Passou |
| C2 antes de C1 = 409; sem login = 401; outra clínica recusada | Passou |
| C1 enfermagem, repetir C1 = 409, C2 enfermagem = 403, C2 médica = 200, snapshot do conferente | Passou |
| Evolução após C2: glicose 90 convertida; TSH sem número, sem zona, sem tendência | Passou |
| Clínica errada não lê a evolução | Passou |
| Três C1 simultâneos: exatamente um vence (200, 409, 409) | Passou |

Regressão: 15 arquivos de exames, 308 testes, 0 falhas; `tsc` limpo.

## Limitações
- IA, Drive, e-mail e WhatsApp simulados; nenhuma prova EXTERNA.
- Nesta SPEC não foi criada tela nova de "unidade pendente"; a célula chega à tela com `status: conferencia`.
- Recuperação de documentos presos (`recoverStuckDocuments`) não foi exercitada neste teste.

## Checkpoint
Realizado: acima. Pendências: tela explícita para unidade sem fator; teste da recuperação. Próxima: SPEC 3.
