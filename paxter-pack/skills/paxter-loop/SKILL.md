---
name: paxter-loop
description: "Loop de auto-correcao do Dr. Caio (modelo do Dr. Claude): ESPECIFICAR -> CONSTRUIR -> REVISAR -> corrigir ate limpo. Ler e seguir quando o CEO pedir 'loop', 'rode o loop', 'spec isso', 'spec', 'build', 'review', ou ao iniciar QUALQUER funcionalidade nao-trivial no Manager. Garante especificacao escrita ANTES de construir e revisao pelo architect ate aprovar sem pendencia. Mantem tambem o CODIGO-PAXTER.md (arquitetura viva em artigos) atualizado a cada aprendizado, anunciando cada insercao ao CEO."
---

# Paxter Loop — Especificar, Construir, Revisar

Metodo de trabalho do CEO Dr. Caio, trazido do Dr. Claude (Claude Code) e adaptado ao ambiente
Replit pelo Dr. Replit Paxter. Regra-mae: **nada nao-trivial vai pro codigo sem uma especificacao
escrita antes; nada e dado por pronto sem passar pela revisao ate ficar limpo.**

Um prompt unico e um palpite. Um loop e um sistema: o agente escreve o alvo, constroi, confere a
propria obra contra o alvo, corrige as falhas e repete ate aprovar.

## Codigo Paxter (arquitetura viva) — LER e MANTER

O arquivo companheiro `CODIGO-PAXTER.md` (mesma pasta) e a arquitetura completa do trabalho com o CEO,
escrita em ARTIGOS (estilo Codigo Civil), com numeracao propria: CEO e comunicacao, Densidade B, conduta,
equipe fixa, empresas e vocabulario, o proprio Paxter Loop, Canvas, atualizacao viva e aprendizados do
projeto.

Protocolo de atualizacao viva (OBRIGATORIO):

| Passo | O que fazer |
|---|---|
| 1. LER | Antes de tarefa nao-trivial, ler `CODIGO-PAXTER.md` + a memoria (`.agents/memory`). |
| 2. PROMULGAR | Ao aprender algo DURAVEL de metodo/diretriz, inserir novo artigo no titulo certo do `CODIGO-PAXTER.md`. |
| 3. ANUNCIAR | Avisar o CEO de cada insercao: numero do artigo, titulo, texto e data (dd/mm/aaaa). |
| 4. REORGANIZAR | A cada insercao, renumerar/reagrupar e registrar no "Historico de Promulgacoes". |
| 5. SEPARAR | Aprendizado tecnico fino vai para a memoria; o Codigo guarda METODO e DIRETRIZ, nunca changelog. |

## Diferenca honesta: Claude Code x Replit (Paxter)

No Claude Code o CEO digita `/spec`, `/build`, `/review` (comandos com barra). Aqui no Replit NAO
existe esse comando com barra digitado pelo usuario. A adaptacao fiel:

| Como funciona aqui (sem mentira tecnica) | Detalhe |
|---|---|
| O CEO aciona por FALA | "rode o loop nisso", "faz o spec disso", "ja pode buildar", "manda revisar" |
| Eu (Paxter) carrego esta skill sozinho | Para toda funcionalidade nao-trivial, sigo o loop por padrao |
| A REVISAO e um revisor SEPARADO (mais forte que auto-revisao) | O `architect` da skill `code_review` confere a obra contra a spec |

## Quando rodar o loop

| Situacao | Rodar o loop? |
|---|---|
| Funcionalidade nova, mudanca ampla, motor de calculo, schema, dado real | SIM (sempre) |
| Algo arriscado ou dificil de desfazer (apagar dado, auth, pagamento) | SIM (sempre) |
| Ajuste trivial (texto, cor, 1 linha obvia) | NAO precisa (mas a revisao rapida ainda ajuda) |

## O loop (blueprint)

```
IDEIA do CEO
   |
   v
[ FASE 1 - ESPECIFICAR ] -- entrevista 1 pergunta por vez --> escreve specs/<nome>.md
   |
   v
[ FASE 2 - CONSTRUIR ] -- constroi EXATAMENTE a spec, nada a mais --> lista o que cumpriu
   |
   v
[ FASE 3 - REVISAR ] -- architect confere requisito por requisito contra a spec
   |
   +--> achou falha? --> volta para CONSTRUIR (corrige so o apontado) --> revisa de novo
   |
   +--> tudo cumprido, zero pendencia? --> APROVADO --> FEITO
```

## Fase 1 — ESPECIFICAR (o alvo)

1. ENTREVISTAR o CEO: uma pergunta especifica por vez (Art.43 do replit.md: opcoes A/B/C
   empilhadas, com default recomendado). NAO comecar a construir nesta fase.
2. Parar de perguntar quando entender: objetivo, requisitos obrigatorios, restricoes e o que
   significa "PRONTO".
3. ESCREVER a especificacao em `specs/<nome>.md` (na raiz do projeto), contendo SEMPRE:
   - Objetivo (uma frase).
   - Requisitos exatos (lista numerada, sem ambiguidade).
   - Casos extremos a tratar (o que pode dar errado).
   - Definicao de PRONTO (criterios concretos que qualquer um consegue conferir).
   - Linhas vermelhas do projeto (ex.: NUNCA tocar `/api/budgets/calculate` nem o motor de
     desmembramento; nunca mudar motor de calculo/payload por estetica).

## Fase 2 — CONSTRUIR (a obra)

1. Ler `specs/<nome>.md` e construir EXATAMENTE o que esta escrito.
2. NAO adicionar funcionalidade fora da spec, NAO refatorar codigo alheio, NAO inventar
   requisito que nao esta na spec.
3. Ao terminar, LISTAR cada requisito da spec que foi cumprido (para a revisao conferir).

## Fase 3 — REVISAR (o juiz)

1. Chamar o `architect` (skill `code_review`) com: a spec como `task`, os arquivos tocados em
   `relevantFiles` e `includeGitDiff: true`. Pedir conferencia requisito por requisito.
2. Para CADA lacuna/bug, registrar o item EXATO da spec que falhou e a correcao necessaria.
3. So aprovar quando TODOS os requisitos da spec estiverem 100% cumpridos.
4. Se reprovar: voltar a Fase 2 e corrigir APENAS o apontado; depois revisar de novo. Repetir
   ate aprovar (foi o que aconteceu, por exemplo, no alerta clinico: reprovou, corrigi, reprovou,
   corrigi, aprovou).

## Definicao de PRONTO (vale para todo loop)

| Criterio | Conferido por |
|---|---|
| Todos os requisitos da spec cumpridos | architect (Fase 3) |
| Validado de verdade (execucao real + screenshot quando for tela) | runtime/captura, nao so "compilou" |
| Nenhuma linha vermelha violada | leitura do diff |
| Comunicacao final ao CEO em Densidade B | replit.md Art.37-51 |

## Regras de ouro

1. Spec ANTES de codigo. Sem spec escrita, nao construir nao-trivial.
2. Construir so o que esta na spec. Escopo extra = nova spec, nao improviso.
3. Revisao e obrigatoria e e feita pelo architect (revisor separado), nao por auto-elogio.
4. O loop repete ate ZERO pendencia. "Quase pronto" nao e pronto.
5. Comunicar com o CEO sempre em Densidade B; explicar siglas; fechar com "RESUMO EM 1 LINHA".
6. As specs (`specs/*.md`) sao .md e podem alimentar o cofre do Dr. Obsidian.
