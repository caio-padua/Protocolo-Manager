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
**How to apply:** so atuam onde a classe e aplicada explicitamente (sem efeito global). Nao misturar com `shadow-*`/`bg-*`/`rounded-*` conflitantes no mesmo elemento — eles SILENCIOSAMENTE nao aplicam (sem erro de build). Para TINGIR um bloco em relevo (ex.: fundo verde do alerta "dentro do alvo"), crie uma classe companheira UNLAYERED (padrao `.bevel-3d-ok`) que sobrescreve so `background`/`border-color`; nunca confie em `bg-emerald-50`/`border-emerald-300` sobre um `bevel-3d`.

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
**How to apply:** clique/teclado da FrequencyBar e o render compartilham `frequencyFill`/`FREQ_SEGMENTS` — manter consistentes. Desconto por pacote vira ORGANOGRAMA no `incentive-banner`: titulo SALIENTE (`screen-3d`) "Desconto por Volume do Protocolo" no TOPO; imagem REAL do cofrinho (render 3D realista nas cores da marca verde-petroleo/ciano com FUNDO TRANSPARENTE, SEM moldura) IMPORTADA pelo empacotador: `import cofrinhoEconomia from "@/assets/cofrinho-economia.png"` (arquivo em `src/assets/`, NAO em public). **Why:** o caminho de runtime `${import.meta.env.BASE_URL}...png` quebrava (mostrava o alt "Cofrinho de" como caixa quebrada) por timing/cache do public; importar pelo Vite garante a URL e o `onError` esconde a img em vez de exibir alt quebrado. Exige `src/vite-env.d.ts` com `/// <reference types="vite/client" />` para tipar import de .png; "AGORA -X%" --seta--> "META -Y%" (rotulo `screen-3d`, valor `concave-3d`); botao `.btn-3d` "Adicionar N sessoes". A progressao de faixas e uma BARRA HORIZONTAL segmentada (componente `TierTrack` em novo.tsx, padrao das barras de Sessoes/Frequencia): preenchida ate a faixa ATUAL, LED ciano pulsante (`paxter-led-on`) marcando a faixa atual e, abaixo, % + limiar de sessoes por faixa. Substituiu a antiga escada vertical `TierLadder` (removida; `ArrowUp` saiu do import). `effTiers = r.itemVolumeTiers ?? settings?.itemVolumeTiers` (somente leitura; motor `/api/budgets/calculate` e payload de salvar INTACTOS); so renderiza com >=2 faixas. A linha do organograma usa `flex-wrap` e o botao vira `w-full` no mobile.

## Terminologia: "PACOTE", nao "volume" (D1)
Na UI do orcamento o desconto por escala chama-se "no pacote" / "Desconto por pacote" (antes "volume").
**Why:** decisao do CEO (18/06/2026) — "pacote" e o termo de negocio que ele usa com o cliente.
**How to apply:** so a STRING/label muda; o motor e o payload continuam com os mesmos campos (a logica de tiers por escala nao muda de nome no codigo do servidor).

## Vocabulario 3D do CEO: CONCAVO (rotulo afundado) vs CONVEXO (numero saltando)
Decisao estetica do CEO para a tela de orcamento: ROTULOS/titulos de bloco e o chip de dose usam `concave-3d` (sombra interna no topo = "entra na tela", como menu pressionado); NUMEROS (preco, frequencia read-only, subtotal, StatPanel, valor do SessionStacker) usam `screen-3d` (sombra externa profunda = "mini tela que sai da folha"). As barras de progresso (sessoes, frequencia, incentivo) sao SEGMENTADas em quadradinhos (`flex-1` + `gap-[3px]` + `rounded-[2px]/[3px]`), nunca barra continua/gradiente — visual "tecnologico" pedido pelo CEO.
**Why:** o CEO rejeitou cantos quadrados estilo Windows e barras lisas; quer relevo forte (sombra intensa, altura maior, arredondado) e numeros em destaque tatil.
**How to apply:** ao adicionar campo nessa tela, rotulo->concave, numero->screen, qualquer barra->segmentos. Preco e "por sessao" por extenso EMPILHADO (nunca "/ sessao").

**Excecao local (organograma do desconto):** o CEO INVERTEU a convencao dentro do banner de incentivo — o ROTULO "AGORA"/"META" usa `bevel-3d` (bevel GROSSO) com um `Led` (luz latente) ao lado, e o VALOR usa `concave-3d` mostrando a PORCENTAGEM grande em cima e as SESSOES pequenas embaixo, ao contrario do resto da tela. Proposital, documentado no comentario do JSX; so vale dentro do organograma. A seta entre eles e um 3o subbloco `screen-3d`.

## Primitivas Paxter de luz/relevo (reuso global)
`paxter-led` (+`paxter-led-on` pulso / `paxter-led-off` apagado), `bevel-3d` (chanfro saliente "botao grosso"), `paxter-attention` (outline ciano que pisca no hover), `paxter-underglow` (neon ciano ESTAVEL subindo do rodape, NAO pisca) e `paxter-alert` (+`-red`/`-amber`: painel de alerta com bevel 3D + neon na propria cor) vivem UNLAYERED no fim de `index.css`, cada uma com variante `.dark`, junto das classes 3D. O preco cheio cancelado no Subtotal recebe apenas um RISCO VERMELHO FINO horizontal (`span absolute h-[1.5px] bg-red-500/70 rounded-full pointer-events-none`) — NAO mais X nem selo de proibido; as guias verticais alinham por caixa de largura fixa + `flex justify-between`.
**Why:** o CEO itera muito no banner; a cada rodada troca a metafora (X -> selo -> risco fino; pulso piscante -> underglow estavel). A fonte-da-verdade VIVA dos padroes Paxter e a skill `skill-layout-paxter` — atualizar a skill a cada rodada, nao so o codigo.
**How to apply:** LED para "voce esta aqui"/meta/atingido; `bevel-3d` onde o CEO quer botao que salta; `paxter-attention` (hover) usa `outline` (nunca `box-shadow`); em bloco interativo que precisa chamar atencao sem piscar use `paxter-underglow`; alerta clinico (excede teto/abaixo do minimo) usa `paxter-alert` + variante de cor. Icone da substancia = frasco-ampola flat (`Ampola` em VitrineCard.tsx), mesmo estilo do porquinho.

## Alerta clinico TRI-ESTADO: mesma fala-base "limite terapeutico" + faixa
`clinicalAlert(r)` retorna `{kind, left, right}` com kind = `over` | `under` | `ok`. Os TRES estados usam a MESMA fala-base "limite terapeutico" + a FAIXA entre parenteses por extenso ("N a M por mes"; degrada para "ate M por mes" so-max ou "a partir de N por mes" so-min): left = "Acima/Abaixo/Dentro do limite terapeutico (faixa)"; right = "Espace para no minimo X dias" / "Use no maximo X dias entre aplicacoes" / "Posologia no alvo". Render `justify-between`, "por mes" por extenso.
**Why:** decisao do CEO (19/06/2026, Art.50): antes cada estado tinha frase DIFERENTE ("teto", "minimo", "faixa terapeutica") e o estado "dentro" quase nao aparecia no desktop; unificar a fala-base reduz carga cognitiva. "teto" continua PROIBIDO no contexto clinico.
**How to apply:** o estado "ok"/dentro NAO ganha cor por `bg-emerald-50` (utilitario perde para o `bevel-3d` unlayered) — usa a classe companheira unlayered `.bevel-3d-ok` (tinge fundo+borda esmeralda mantendo o relevo). Ver secao do relevo 3D.

## Chip de dose: so a magnitude, com guarda de overflow
No cabecalho, `doseMain = doseDisplay.split("—")[0].trim() || doseDisplay` mostra so a magnitude (ex.: "200 MG"), cortando a parte apos o travessao em-dash. O chip tem `max-w-[180px] truncate` + `title={doseDisplay}` para posologia longa sem travessao.
**Why:** sem o `|| doseDisplay`, dose sem em-dash sumiria; sem max-w, posologia longa estoura o cabecalho.

## Apresentacao (link ao cliente): verde = SO "Aceito"; recomendado = moldura, nao botao
Nos cards de cenario da Apresentacao (`apresentacao.tsx`, componente `CaminhoCard`), os botoes "Escolher este" sao TODOS iguais (`btn-3d-soft`). O destaque do cenario recomendado vem de CONTORNO + SOMBRA verde-petroleo por baixo do painel (`.panel-3d-rec`, definida depois de `.panel-3d`) e do selo do topo em RELEVO 3D (`bevel-3d` + LED). Verde solido (`.btn-3d-ok`, verde sucesso, NAO o teal da marca) aparece UNICA e exclusivamente no card ja aceito.
**Why:** o CEO (19/06/2026) reprovou o botao teal cheio no recomendado — parecia "aceito" e confundia o paciente. Cor cheia no botao = significado "ja escolhido"; recomendacao nao pode roubar esse significado.
**How to apply:** nunca dar botao colorido permanente ao recomendado; destaque so por borda/sombra/selo. Reservar verde para estado terminal. Info de desconto e pagamento sempre EMPILHADA (valor embaixo de valor: chip "X% de desconto" -> "voce economiza" -> valor; Entrada/Saldo um sob o outro), nunca em linha com middot.

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
