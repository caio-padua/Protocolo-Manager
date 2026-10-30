---
name: paxter-loop
description: "PAXTER Loop: DESENHAR -> ESPECIFICAR -> PREVER FALHAS -> CONSTRUIR -> REVISAR -> TESTAR -> HOMOLOGAR -> APRENDER. Usar ao iniciar funcionalidade nao-trivial no Manager ou quando solicitado loop, spec, build ou review. Exige impacto, falhas previstas, correcao de causas impeditivas, evidencia e revisao independente sequencial."
---

# PAXTER Loop — Integridade da entrega

Metodo de trabalho do CEO Dr. Caio, trazido do Dr. Claude (Claude Code) e adaptado ao ambiente
Replit pelo Dr. Replit Paxter. Regra-mae: **nada nao-trivial vai pro codigo sem uma especificacao
escrita antes; nada e dado por pronto sem passar pela revisao ate ficar limpo.**

Vigencia: 29/10/2026. Fonte canonica: `.agents/skills/paxter-loop/CODIGO-PAXTER.md`,
artigos 75 a 82. Uma implementacao por vez; revisao independente sequencial.
O espelho em `paxter-pack/` nao e autoridade. Esta regra documental nao interrompe
agentes preexistentes da plataforma. Nao declarar que eles pararam sem verificar.

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
| 4. PRESERVAR | Manter numeros e citacoes historicas; adicionar artigos/sufixos e registrar no "Historico de Promulgacoes". |
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

DESENHAR -> ESPECIFICAR -> PREVER FALHAS -> CONSTRUIR -> REVISAR -> TESTAR -> HOMOLOGAR -> APRENDER.

```
DESENHAR -> ESPECIFICAR -> PREVER FALHAS -> CONSTRUIR
                                              |
                                              v
APRENDER <- HOMOLOGAR <- TESTAR <- REVISAR (independente)

Descoberta impeditiva -> BLOQUEADO -> atualizar especificacao
                     -> corrigir causa -> revisar e testar novamente
```

## Fases 1 a 3 — DESENHAR, ESPECIFICAR e PREVER FALHAS

Antes de construir, mapear produtores, consumidores, contratos, identidades,
permissoes, persistencia, efeitos externos e dependencias. Registrar matriz de
falhas com gravidade, causa, consequencia, barreira, recuperacao e teste.
Reutilizar a arquitetura existente. Perguntar somente ambiguidades relevantes.

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

## Fase 4 — CONSTRUIR

1. Ler `specs/<nome>.md` e implementar a especificacao vigente, atualizando-a
   previamente quando descoberta impeditiva exigir dependencias adicionais.
2. Descoberta que compromete a entrega: registrar gravidade, causa provavel,
   dependencias e impacto; bloquear homologacao, atualizar especificacao e testes,
   corrigir a causa e revalidar. Escopo inicial nao justifica ignorar impeditivo.
   Descoberta independente: documentar e classificar sem expandir a entrega.
   Isso nao autoriza apagar dados, operar producao, cobrar ou enviar mensagens reais.
3. Ao terminar, LISTAR cada requisito da spec que foi cumprido (para a revisao conferir).

## Fase 5 — REVISAR

1. Suspender a implementacao e obter revisao independente, em sequencia.
   Usar as instrucoes atuais de `.local/skills/code-review/SKILL.md`, sem inventar
   ferramentas. Revisar requisitos, impactos e falhas alem do texto inicial.
   Se revisor indisponivel, registrar BLOQUEADO; autorrevisao nao o substitui.
2. Para CADA lacuna/bug, registrar o item EXATO da spec que falhou e a correcao necessaria.
3. So aprovar quando TODOS os requisitos da spec estiverem 100% cumpridos.
4. Se reprovar, retornar a fase pertinente, corrigir causas e impactos, atualizar
   a especificacao e repetir revisao e testes aplicaveis. Nunca enfraquecer testes.

## Fases 6 a 8 — TESTAR, HOMOLOGAR e APRENDER

Executar testes de unidade, integracao, contrato, seguranca, regressao e ponta a
ponta conforme o risco. Cobrir caminho legitimo, medico/clinica/cliente errados,
falhas de banco e rede, resposta atrasada, concorrencia, repeticao, cancelamento,
sessao expirada, recuperacao e resultado persistido. Justificar inaplicabilidades.
Usar dados sinteticos e ambientes isolados, com servicos externos simulados.
Dados reais somente em jornadas expressamente autorizadas e supervisionadas.

Evidencias devem informar revisao examinada, arquivos ou hashes, comando,
resultado, ambiente e limitacoes. Campo de aprovacao escrito pelo executor nao
autoriza publicacao. Nao confundir inventario de arquivos ou cobertura de linhas
com correcao integral. Compilacao ou commit isolados nao homologam.

Estados de engenharia: PLANEJADO, EM ESPECIFICACAO, EM CONSTRUCAO, EM REVISAO,
EM TESTE, BLOQUEADO e HOMOLOGADO. Eles nao substituem estados da plataforma.
Sem evidencia ou com impeditivo, BLOQUEADO. Aprender registra apenas regras e
licoes duraveis no destino correto, sem duplicar perfil pessoal na memoria.

## Definicao de PRONTO (vale para todo loop)

| Criterio | Conferido por |
|---|---|
| Requisitos e dependencias de seguranca satisfeitos | Revisao independente, Fase 5 |
| Testes e regressao executados, evidencias da revisao atual | Fase 6; justificar inaplicabilidade |
| Nenhum impeditivo conhecido nem evidencia obrigatoria ausente | Fase 7 |
| Validado de verdade (execucao real + screenshot quando for tela) | runtime/captura, nao so "compilou" |
| Nenhuma linha vermelha violada | leitura do diff |
| Comunicacao final ao CEO em Densidade B | replit.md Art.37-51 |

## Regras de ouro

1. Spec ANTES de codigo. Sem spec escrita, nao construir nao-trivial.
2. Atualizar a especificacao ao descobrir dependencia impeditiva; nao improvisar nem ignorar.
3. Revisao e obrigatoria e e feita pelo architect (revisor separado), nao por auto-elogio.
4. O loop repete ate ZERO pendencia. "Quase pronto" nao e pronto.
5. Comunicar com o CEO sempre em Densidade B; explicar siglas; fechar com "RESUMO EM 1 LINHA".
6. As specs (`specs/*.md`) sao .md e podem alimentar o cofre do Dr. Obsidian.
7. Nao iniciar agentes executores paralelos nem novas tarefas automaticamente.
   Proxima unidade somente apos aceite. Revisores trabalham em sequencia.

## Verificacao normativa e historico

`pnpm run check:paxter-governance` verifica documentos e espelho.
`pnpm run test:paxter-governance` exercita divergencias artificiais em memoria.
`node scripts/paxter-governance.mjs --sync` sincroniza apenas os dois arquivos do
loop e seus registros nos manifestos, sem alterar layout ou apagar o pack.
Isso verifica governanca documental, nao homologa seguranca clinica.

- 19/06/2026: metodo original de tres fases, preservado no historico do Git.
- 29/10/2026: oito fases, Arts. 75 a 82, impacto, descobertas impeditivas,
  homologacao por evidencia, revisao sequencial e isolamento de testes.
