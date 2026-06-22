# Spec — Identidade PAXTER vetorial (nome + frases em ouro, efeito caminha por elas)

Status: FASE 1 (ESPECIFICAR). Uma decisão em aberto (letra-forma do nome). Não construir até o CEO escolher.
Data: 22/06/2026.

## Objetivo

Transformar o nome **PAXTER** e as três frases auxiliares em **vetores reais em ouro** (SVG path),
guardados como dado canônico da marca na pasta da skill, para que o efeito de brilho/pólvora
"caminhe por eles" igual ao símbolo, e o CEO possa ajustar profundidade/forma depois sem retrabalho.

## Textos exatos (travados — item 4)

| Elemento | Texto exato |
|---|---|
| Nome (wordmark) | `PAXTER` |
| Frase 1 | `Clinical Intelligence System` |
| Frase 2 | `PRECISION IN INTEGRATIVE CARE` |
| Frase 3 | `AI-guided prescriptions, exams and injectable protocols.` |

## Requisitos exatos

1. Cada elemento (nome + 3 frases) renderiza como **SVG path vetorial**, não como `<text>` de fonte.
   Motivo: o efeito de brilho precisa mascarar/traçar a FORMA das letras (caminhar por elas).
2. Preenchimento em **ouro polido** usando os tokens JÁ travados da marca (paxter3d.ts), não a
   paleta nova do Dr. Chat (ver auditoria, item 5). Fundo navy travado (`.paxter-bg`), não o quase-preto.
3. O motor de efeito atual (`PaxterGlintPremium` / traceFlash) consome esses paths do MESMO jeito
   que consome o símbolo hoje (flash que corre + varrimento mascarado). Sem motor novo.
4. Profundidade 3D (relevo/extrusão/bevel) parametrizável por elemento — o CEO ajusta os números
   (extrusão, sombra, bevel) sem reescrever o vetor.
5. Os dados canônicos (paths + textos + tokens + parâmetros de profundidade) ficam **na pasta da
   skill** `skill-layout-paxter/references/` (fonte-da-verdade). O código do mockup/app importa/clona
   de lá. Registrado também na própria skill (Lei do Registro de Modelagem, secção 0.1).
6. Toggle claro/escuro nas telas de anamnese (item 1) — chavinha 3D dourada que alterna tema na
   mesma tela.

## Caso extremos a tratar

1. Frase 3 é longa — pode estourar a largura no celular; precisa quebrar ou escalar.
2. Gradiente de ouro repetido em vários paths colide id de `<linearGradient>` entre instâncias
   (usar id único por instância — lição já registrada na memória).
3. Acessibilidade: o SVG precisa de `aria-label` com o texto, já que não há `<text>` legível.
4. `prefers-reduced-motion` continua desligando o efeito (já tratado no motor).

## Definição de PRONTO

| Critério | Como conferir |
|---|---|
| Nome + 3 frases aparecem como vetor ouro, com relevo | screenshot das telas |
| Efeito de brilho caminha pelas letras (não só pelo símbolo) | observação do preview |
| Dados canônicos gravados na pasta da skill e importados pelo código | leitura do diff |
| Tokens de ouro/navy = os travados da marca (não a paleta do Dr. Chat) | leitura do diff |
| Toggle claro/escuro funciona nas telas de anamnese | screenshot nos 2 temas |
| Aprovado pelo architect sem pendência | Fase 3 |

## Linhas vermelhas

1. NÃO trocar os tokens de ouro/navy travados por estética nova sem ordem do CEO.
2. NÃO criar motor de efeito novo — reusar o atual.
3. NÃO usar os paths INVENTADOS do símbolo que o Dr. Chat colou (são placeholders); o símbolo real
   é o `PAXTER_SYMBOL_PATH` já traçado do PNG.
4. NÃO depender de fonte comum no resultado final (vetor é a entrega).

## DECISÃO EM ABERTO (trava a construção) — letra-forma do nome PAXTER

- Opção A (recomendada): fonte premium serifada open-source (Cinzel) convertida em vetor para o
  nome E as 3 frases; cada letra vira path EDITÁVEL; o "P vazado" é esculpido depois sobre o path.
  Sólido já, ajustável até a profundidade, sem custo de licença, sem retrabalho de pipeline.
- Opção B: fonte premium nas 3 frases + "P vazado" desenhado à mão só no P do nome.
  Mais fiel ao desenho do Dr. Chat, porém mais lento e com risco de o P sair tosco antes de afinar.
- Opção C: as 6 letras de PAXTER 100% desenhadas à mão. Controle máximo, mais demorado, maior risco.
