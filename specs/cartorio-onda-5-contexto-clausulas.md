# Spec — Cartório Onda 5: Contexto Clínico no Editor + Biblioteca de Cláusulas

Data: 26/06/2026. Método: Paxter Loop. Pai: `specs/cartorio-master.md`. Depende de: Onda 1.

## Objetivo (uma frase)
Ao redigir um documento, trazer o contexto clínico do paciente (anamnese, evolução, sessões) para apoiar
a redação, e oferecer uma biblioteca de CLÁUSULAS reutilizáveis para casos de risco fora do padrão.

## Requisitos exatos
1. No editor da Onda 1, painel lateral "Contexto do paciente" (somente leitura) com resumo de: doenças
   ativas/red flags (motor), últimas evoluções (`ras_evolutivo`), avaliações de enfermagem
   (`nursing_assessments`) e últimas sessões. Fonte: chamadas próprias (nervo), sem alterar o Cockpit.
2. Tokens de mesclagem: o editor oferece inserir lacunas `{{NOME}}`, `{{CPF}}`, `{{DATA}}`,
   `{{PROTOCOLO}}` etc., preenchidas pelo backend no envio (já suportado por `dados` no motor da Onda F).
3. Biblioteca de CLÁUSULAS: nova tabela `assinatura_clausulas` (nativa) com `codigo`, `titulo`,
   `corpo_html`, `categoria` (ex.: RISCO, OFF-LABEL, COMORBIDADE). CRUD por endpoints
   `GET/POST/PUT/DELETE /api/assinaturas/clausulas` (requireCollaborator).
4. No editor, botão "Inserir cláusula" abre a biblioteca e injeta o `corpo_html` da cláusula escolhida no
   ponto do cursor, permitindo edição livre depois (cláusula personalizada para aquele paciente).
5. Cláusulas mais usadas aparecem no topo (contagem de uso simples).

## Casos extremos
1. Paciente sem anamnese/evolução → painel mostra "Sem registros" sem quebrar.
2. Cláusula apagada que já foi usada num documento enviado → não afeta o documento já gerado (o corpo é
   "achatado" no PDF no momento do envio).
3. HTML de cláusula malformado → sanitizar antes de injetar (evitar quebrar o editor/o PDF).

## Linhas vermelhas
Herda da spec-mãe. Painel de contexto é SOMENTE LEITURA; nunca escreve em anamnese/evolução. Sanitizar
todo HTML de cláusula antes de inserir.

## Definição de PRONTO
| Critério | Como conferir |
|---|---|
| Painel de contexto mostra dados reais do paciente | screenshot |
| Inserir token/lacuna e ser preenchido no envio | PDF gerado com o valor |
| CRUD de cláusulas funciona | curl + SELECT em `assinatura_clausulas` |
| Inserir cláusula no editor injeta o texto | screenshot |
| architect PASS, zero pendência | revisão requisito por requisito |

RESUMO EM 1 LINHA: o editor ganha um painel de contexto clínico (leitura) e uma biblioteca de cláusulas
reutilizáveis para montar documentos personalizados de risco, com tokens de mesclagem por paciente.
