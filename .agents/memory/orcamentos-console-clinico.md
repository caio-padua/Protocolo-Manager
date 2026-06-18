---
name: Orcamentos "Console Clinico" (tela Montagem do Orcamento)
description: Decisoes nao-obvias da tela de orcamento (StatPanel/SessionStacker/FrequencyDial) e armadilhas ARIA/dose/navegacao.
---

# Tela Montagem do Orcamento — sub-blocos do item

Reforma puramente visual/interativa de `artifacts/padcom/src/pages/orcamentos/novo.tsx`. Cada item incluido mostra TRES paineis brancos lado a lado (Sessoes | Frequencia | Subtotal), que empilham no mobile, mais um banner/organograma de incentivo. Componentes irmaos na mesma pasta: `StatPanel.tsx` (painel branco de valor), `SessionStacker.tsx` (barra HORIZONTAL segmentada em degrade espectro arco-iris) e `FrequencyDial.tsx` (setas nas extremidades + texto central + custom input; exporta `FrequencyBar`, `frequencyFill`, `frequencyLabel`, `FREQ_STOPS`, `FREQ_SEGMENTS`, `FREQ_LEGEND`).

**Decisao durável (CEO):** abolido o visor digital escuro ("retroiluminado") — os numeros vivem em paineis brancos clean. Se reaparecer pedido de "mostrador escuro", e regressao do que o CEO mandou remover.

## Decisao: dose exibida != dose salva (intencional)
A tela exibe a dose no CABECALHO do item (read-only, vinda do catalogo de substancias: `substance.defaultDose || substance.posologia || r.dose`), mas `salvar()` continua persistindo `r.dose` (dose do catalogo de orcamento).
**Why:** o pedido do CEO sempre exige "motor de calculo e payload de salvar INTACTOS"; so a apresentacao muda. A divergencia display-vs-payload e proposital, NAO bug.
**How to apply:** persistir exatamente a dose exibida seria tarefa separada (afeta o snapshot salvo do orcamento/apresentacao).

## Relevo 3D: classes UNLAYERED para vencer utilitarios Tailwind/shadcn
As classes de relevo (`panel-3d`, `panel-3d-sub`, `panel-3d-hero`, `panel-3d-active`, `field-engraved`, `incentive-banner`, mais o par `concave-3d`/`screen-3d`) ficam no FIM de `index.css` FORA de qualquer `@layer`, com variante `.dark` correspondente. CSS sem layer vence todas as camadas do Tailwind v4, entao sobrepoe `bg-card`/`shadow-sm`/`rounded-*`/`border` do shadcn `Card` de forma previsivel sem `!important`.
**Why:** aplicar relevo direto num `<Card>` shadcn falha por utilitario (camada utilities venceria); unlayered resolve. `panel-3d-active` vem DEPOIS de `panel-3d` para vencer no cascade.
**How to apply:** so atuam onde a classe e aplicada explicitamente (sem efeito global). Nao misturar com `shadow-*`/`bg-*`/`rounded-*` conflitantes no mesmo elemento.

## Raio dos cantos: ~6px (quadrado da marca), NAO 14px premium
As classes de relevo em `index.css` usam border-radius 0.25–0.5rem (4–8px), cantos retos alinhados a marca.
**Why:** o CEO REVERTEU (voz, 18/06/2026) o desvio anterior de 14px/12px "premium"; pediu cantos mais quadrados. Por Art.50, isto substitui a decisao estetica antiga — se reaparecer 14px e regressao.
**How to apply:** ao criar painel/botao nessa tela, manter radius pequeno (<=8px). Botoes usam `.btn-3d` (CTA cheio, afunda no :active) e `.btn-3d-soft` (secundario), e cards do item ganham `.neon-hover` (luz ciano de baixo no hover) — todos UNLAYERED no fim do `index.css`. O componente GLOBAL `Switch` (`components/ui/switch.tsx`) tambem virou quadrado (root `rounded-[5px]`, thumb `rounded-[3px]`) — decisao de marca, afeta o app inteiro; se reaparecer `rounded-full` no toggle e regressao.

## Layout MATRIZ: 4 linhas compartilhadas pelos 3 blocos
Sessoes, Frequencia e Subtotal alinham em colunas pela MESMA grade de alturas fixas: titulo `h-7`, controle `h-[60px]`, barra/risco `h-5`, legenda `h-4`, `gap-2.5`. Subtotal = preco final (controle) + preco cheio RISCADO na linha da barra + "-X% no pacote" na linha da legenda. Frequencia read-only mostra `FrequencyBar` estatica + `FREQ_LEGEND` (mantem a grade).
**Why:** o CEO quer leitura "tipo planilha/matriz" — as 4 linhas batem horizontalmente entre as 3 colunas.
**How to apply:** as 4 linhas-chave alinham no TOPO; afordancias extras (botao "Eu digito um intervalo"; texto "definido no catalogo" no read-only) ficam na FOLGA abaixo da legenda, nunca dentro das 4 linhas. Manter o custom input e exigencia do CEO (nao remover para "fechar" a matriz).

## Barras: significados FIXOS (nao inverter)
SessionStacker = arco-iris (vermelho->verde), legenda unica central "AZUL = MELHOR PRECO" (sem "MENOS/MAIS"); mais sessoes = melhor preco. FrequencyBar = cor unica ciano `hsl(187 72% 48%)`, `fill=frequencyFill` (MENOR intervalo entre doses = barra MAIS cheia = mais eficiente), legenda `FREQ_LEGEND="Menor intervalo = mais eficiente"`.
**Why:** o CEO definiu a direcao semantica; inverter o fill (intervalo maior = mais cheio) ou trocar a cor da frequencia por degrade quebra a leitura pedida.
**How to apply:** clique/teclado da FrequencyBar e o render compartilham `frequencyFill`/`FREQ_SEGMENTS` — manter consistentes. Desconto por pacote vira ORGANOGRAMA no `incentive-banner`: titulo SALIENTE (`screen-3d`) "Desconto por Volume do Protocolo" no TOPO; imagem REAL do cofrinho (render 3D realista nas cores da marca verde-petroleo/ciano com FUNDO TRANSPARENTE, SEM moldura) IMPORTADA pelo empacotador: `import cofrinhoEconomia from "@/assets/cofrinho-economia.png"` (arquivo em `src/assets/`, NAO em public). **Why:** o caminho de runtime `${import.meta.env.BASE_URL}...png` quebrava (mostrava o alt "Cofrinho de" como caixa quebrada) por timing/cache do public; importar pelo Vite garante a URL e o `onError` esconde a img em vez de exibir alt quebrado. Exige `src/vite-env.d.ts` com `/// <reference types="vite/client" />` para tipar import de .png; "AGORA -X%" --seta--> "META -Y%" (rotulo `screen-3d`, valor `concave-3d`); botao `.btn-3d` "Adicionar N sessoes". A antiga barra de 12 segmentos + a frase-fluxo "faltam" foram SUBSTITUIDAS pela ESCADA (componente `TierLadder` em novo.tsx): barras de ALTURA crescente por faixa de desconto, seta `ArrowUp` de chegada + limiar de sessoes, faixa ATUAL destacada com anel ciano. `effTiers = r.itemVolumeTiers ?? settings?.itemVolumeTiers` (somente leitura; motor `/api/budgets/calculate` e payload de salvar INTACTOS); a escada so renderiza com >=2 faixas. A linha do organograma usa `flex-wrap` e o botao vira `w-full` no mobile.

## Terminologia: "PACOTE", nao "volume" (D1)
Na UI do orcamento o desconto por escala chama-se "no pacote" / "Desconto por pacote" (antes "volume").
**Why:** decisao do CEO (18/06/2026) — "pacote" e o termo de negocio que ele usa com o cliente.
**How to apply:** so a STRING/label muda; o motor e o payload continuam com os mesmos campos (a logica de tiers por escala nao muda de nome no codigo do servidor).

## Vocabulario 3D do CEO: CONCAVO (rotulo afundado) vs CONVEXO (numero saltando)
Decisao estetica do CEO para a tela de orcamento: ROTULOS/titulos de bloco e o chip de dose usam `concave-3d` (sombra interna no topo = "entra na tela", como menu pressionado); NUMEROS (preco, frequencia read-only, subtotal, StatPanel, valor do SessionStacker) usam `screen-3d` (sombra externa profunda = "mini tela que sai da folha"). As barras de progresso (sessoes, frequencia, incentivo) sao SEGMENTADas em quadradinhos (`flex-1` + `gap-[3px]` + `rounded-[2px]/[3px]`), nunca barra continua/gradiente — visual "tecnologico" pedido pelo CEO.
**Why:** o CEO rejeitou cantos quadrados estilo Windows e barras lisas; quer relevo forte (sombra intensa, altura maior, arredondado) e numeros em destaque tatil.
**How to apply:** ao adicionar campo nessa tela, rotulo->concave, numero->screen, qualquer barra->segmentos. Preco e "por sessao" por extenso EMPILHADO (nunca "/ sessao").

**Excecao local (organograma do desconto):** o CEO INVERTEU a convencao dentro do banner de incentivo — o ROTULO "AGORA"/"META" usa `screen-3d` (relevo) e o VALOR "-X%" usa `concave-3d` (profundo), ao contrario do resto da tela. Proposital, documentado no comentario do JSX; so vale dentro do organograma. A seta entre eles e um 3o subbloco `screen-3d`.

## Alerta clinico (teto/minimo mensal) em DUAS pontas, sem barra
`clinicalAlert(r)` retorna `{kind, left, right}` (nao `{kind, msg}`); o render usa `justify-between` com a regra a esquerda ("Excede o teto clinico de N por mes" / "Abaixo do minimo de N por mes") e a acao a direita ("Espace para no minimo X dias" / "Use no maximo X dias"). Texto por extenso "por mes" (nunca "/mes") e sem "(cerca de X)".
**Why:** Art.44 (sem barra/abreviacao) + leitura tipo planilha pedida pelo CEO.

## Chip de dose: so a magnitude, com guarda de overflow
No cabecalho, `doseMain = doseDisplay.split("—")[0].trim() || doseDisplay` mostra so a magnitude (ex.: "200 MG"), cortando a parte apos o travessao em-dash. O chip tem `max-w-[180px] truncate` + `title={doseDisplay}` para posologia longa sem travessao.
**Why:** sem o `|| doseDisplay`, dose sem em-dash sumiria; sem max-w, posologia longa estoura o cabecalho.

## Armadilha ARIA: role="slider" nao pode envolver filhos focaveis
Tanto em `SessionStacker` (barra) quanto em `FrequencyDial` (trilha), o elemento com `role="slider"` + `tabIndex=0` + teclado NAO contem filhos focaveis: os marcadores/preenchimentos sao `<div>` com `aria-hidden`. Botoes +/- ficam IRMAOS do slider, nunca dentro.
**Why:** slider com `<button>` focavel dentro e ARIA invalido e gera tab-stops duplicados.
**How to apply:** padrao slider = um focavel com valuetext/teclado; marcadores clicaveis ficam presentational (div + aria-hidden).

## FrequencyDial: navegacao por VALOR, nao por indice
As setas e o teclado caminham para o stop real (de `FREQ_STOPS` sem o `custom`) imediatamente menor/maior que o valor atual (`prevStop`/`nextStop` por `days`), nunca por `selected ± 1`.
**Why:** o stop "Eu digito" (custom) fica no FIM do array; navegar por indice a partir de um valor personalizado (ex.: 10 dias) saltava para 365 dias. So a busca por valor numerico da o vizinho correto.
**How to apply:** `indexFromValue`/`selected` continuam servindo so para destaque do tick e ARIA; quem decide o proximo valor das setas e a comparacao numerica de `days`.

## Volume por item alinhado por INDICE
`volumeByCatalogId` casa `result.items[idx]` com `includedRows[idx]` (mesma ordem do payload enviado ao motor). Se mudar a ordem/filtro de `includedRows` sem mudar o payload, o desconto por item desalinha.

## Input que REDIMENSIONA array (ex.: "Numero de faixas") precisa de rascunho local
Na Parametrizacao, o campo "Numero de faixas" do `TierEditor` cresce/encurta o array de faixas. Ele usa `countDraft` (estado string local) e so aplica `setCount()` no `onBlur`/Enter — nunca direto no `onChange`.
**Why:** ligar `onChange` a `parseInt(value)||0` faz o campo vazio (passo normal de "apagar para redigitar") truncar TODAS as faixas para zero na hora, perdendo faixas e recriando defaults. Pego em code review.
**How to apply:** qualquer input numerico cujo valor REDIMENSIONA uma lista deve guardar rascunho local e commitar so ao sair/Enter; nunca redimensionar a cada tecla.
