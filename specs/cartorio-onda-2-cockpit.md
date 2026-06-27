# Spec — Cartório Onda 2: Atalho no Cockpit (Documentos & Consentimento)

Data: 26/06/2026. Método: Paxter Loop. Pai: `specs/cartorio-master.md`. Depende de: Onda 1.

## Objetivo (uma frase)
Levar o Cartório para dentro do Cockpit do cliente: um painel "Documentos & Consentimento" que mostra os
documentos daquele paciente e permite enviar um novo dali mesmo, sem sair do contexto clínico.

## Requisitos exatos
1. Novo bloco no Cockpit (`pages/cockpit/index.tsx`) — acordeão na coluna FUTURO, padrão `BlocoFuturo`,
   título "DOCUMENTOS & CONSENTIMENTO" (uppercase, tracking, padrão TDAH/3D Paxter).
2. O bloco lista as solicitações DAQUELE paciente (filtro por `pacienteId` na timeline; se a rota atual
   não filtrar por paciente, estender `GET /api/assinaturas/timeline?pacienteId=` no backend).
3. Cada item mostra: título, tipo, status (badge ao lado do ID), data, e ação contextual
   (ver PDF assinado quando CONCLUÍDO via `GET /api/assinaturas/:id/pdf-assinado`).
4. Botão "Novo documento para este paciente" que abre o fluxo da Onda 1 já com o paciente pré-selecionado
   (deep link para `/cartorio?pacienteId=ID` ou modal embutido — decisão de implementação do Paxter).
5. Contagem/resumo: quantos pendentes e quantos assinados, visível no cabeçalho do bloco.

## Casos extremos
1. Paciente sem nenhum documento → estado vazio com convite "Criar primeiro documento".
2. PDF assinado ainda não disponível (status não CONCLUÍDO) → ação "ver PDF" desabilitada com tooltip.
3. Cockpit já é pesado (muitos blocos) → carregar a lista do bloco sob demanda (ao expandir), não no boot.

## Linhas vermelhas
Herda da spec-mãe. NÃO alterar o DTO existente do Cockpit de forma que quebre os outros blocos; o bloco
de documentos busca seus dados por chamada própria (nervo), não acoplando ao `computeMotor`.

## Definição de PRONTO
| Critério | Como conferir |
|---|---|
| Bloco aparece no Cockpit do paciente | screenshot |
| Lista os documentos só daquele paciente | screenshot + SELECT filtrado |
| Resumo pendentes/assinados correto | conferência visual |
| Botão abre o fluxo com paciente pré-selecionado | screenshot do fluxo |
| Ver PDF assinado funciona quando CONCLUÍDO | download/preview |
| architect PASS, zero pendência | revisão requisito por requisito |

RESUMO EM 1 LINHA: painel "Documentos & Consentimento" no Cockpit que lista e dispara assinaturas do
paciente em contexto, ligado por nervo ao Cartório central da Onda 1.
