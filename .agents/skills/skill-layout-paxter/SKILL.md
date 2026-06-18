---
name: skill-layout-paxter
description: "Sistema de design Paxter (Padcon Conect / PADCOM). Linguagem visual skeuomorfica 3D, vocabulario oficial (Saliente/Bevel, Concavo/Well, Painel 3D), tokens da marca e padroes do Console de Orcamento. Ler ANTES de criar ou redesenhar qualquer tela do Manager para manter a essencia 3D."
---

# Skill Layout Paxter — Sistema de Design (Padcon Conect)

Linguagem visual do Manager, definida pelo CEO Dr. Caio. Mantida pelo Dr. Replit Paxter.
Regra mae: **nunca perca a essencia dos paineis e sub-paineis 3D. So incorpore beneficios.**
Toda mudanca e de APRESENTACAO; o motor de calculo e o payload de salvar nunca mudam por estetica.

## 1. Vocabulario oficial (fala -> codigo)

Sempre falar com o CEO usando "Saliente" e "Concavo". No codigo usar as classes existentes.

| Parte do bloco | Como FALAR | Classe CSS no codigo | O que e |
|---|---|---|---|
| Bloco inteiro que salta da tela | Painel 3D / Skeuomorfico | `panel-3d`, `panel-3d-sub`, `panel-3d-hero` | Cartao com relevo, sombra externa + topo iluminado |
| Bloco selecionado | Painel ativo | `panel-3d-active` | Painel 3D + halo na cor primaria |
| Parte que SAI para fora (alto-relevo) | Saliente / Bevel | `screen-3d` | Mini-tela elevada; numeros/titulos em destaque |
| Parte AFUNDADA (baixo-relevo) | Concavo / Well | `concave-3d` | Campo "gravado" onde o dado entra |
| Campo de input gravado | Campo gravado | `field-engraved` | Input afundado: degrade sutil no topo + sombra interna forte (insert nitido) |
| Tecla classica | Botao 3D | `btn-3d`, `btn-3d-soft` | Botao que afunda no `:active` |
| Faixa de incentivo | Banner de incentivo | `incentive-banner` | Degrade mint suave, carrega "quanto falta" |
| Bevel GROSSO (botao alto) | Bevel grosso | `bevel-3d` | Chanfro saliente forte; impressao de botao grosso que salta da folha |
| Luz latente (LED) | LED / luz | `paxter-led` (+`-amber`/`-green`/`-red`) + `paxter-led-on` / `-off` | Ponto que acende/apaga (pulso); ciano padrao, amarelo=AGORA, verde=META/OK, vermelho=excede; LED verde SEM `-on` = aceso ESTAVEL (calmo, sem neon) |
| Pulso de atencao | Pulso / atencao | `paxter-attention` | Outline ciano que pisca no hover SEM apagar o relevo |
| Neon estavel de baixo | Underglow | `paxter-underglow` | Luz ciano que sobe do rodape, ESTAVEL (nao pisca), intensa e difusa |
| Alerta em relevo + neon | Alerta clinico | `paxter-alert` (+`-red`/`-amber`) | Painel de alerta com bevel 3D e neon na propria cor (vermelho/ambar) |

Skeuomorfico = estilo que imita objeto fisico real (parece botao/tela de verdade).
Bevel = chanfro que projeta para fora. Well/Inset = campo afundado para dentro.

As definicoes vivem em `artifacts/padcom/src/index.css` (procurar `.panel-3d`, `.screen-3d`,
`.concave-3d`, `.field-engraved`, `.incentive-banner`, `.btn-3d`). Essas classes sao
**unlayered de proposito** para vencer utilitarios do Tailwind/shadcn — nao reordenar camadas.

## 2. Tokens da marca

| Token | Valor | Uso |
|---|---|---|
| Verde-petroleo (primary) | `#3D7A7A` / `hsl(180 30% 28%)` | Sidebar, titulos, barras preenchidas |
| Ciano (accent) | `#45B8CC` / `hsl(187 72% 48%)` | Destaque do item atual, halos, anel de foco |
| Branco | `#FFFFFF` | Fundo de paineis claros |
| Cantos | radius 6px a 8px (`0.25rem`–`0.375rem`) | SEMPRE quadrados; nunca pill/arredondado infantil |
| Labels KPI | MAIUSCULO + `tracking` expandido | Rotulos de indicador |

Estilo: elegante, empirico, sem infantilidades. Tema escuro tem variantes `.dark` para
todas as classes 3D — ao criar classe nova, criar tambem a variante `.dark`.

## 3. Padroes de composicao

- **Conclusao visual primeiro**: o numero/decisao em Saliente; o detalhe em Concavo.
- **Fluxo, nao frase**: caminho/sequencia vira blueprint com setas (ex.: AGORA -> META),
  nunca paragrafo linear. Vale na tela como na resposta ao CEO (Densidade B).
- **Barras**: preferir segmentos a barra continua lisa. A faixa atual NAO leva bolinha por
  cima: ela PULSA a propria luz por detras (`paxter-tier-live`, glow via `filter: drop-shadow`,
  mesma cadencia 1.4s das LEDs). Faixas atingidas preenchidas (primary), futuras esmaecidas.
- **Barra de evolucao horizontal (TierTrack)**: faixas de desconto como barra HORIZONTAL
  segmentada (mesmo padrao das barras de Sessoes/Frequencia), preenchida ate a faixa ATUAL,
  faixa atual pulsando a luz por detras e, abaixo, DOIS inserts concavos RETANGULARES por
  faixa (% e limiar de sessoes; nunca empilhados). Os dois inserts tem MESMA altura e largura
  (`h-7`, `flex-1`), com ESPACO entre simbolo e numero (`- N %`, `>= N`) e fonte legivel
  (`text-[11px]`) — nunca numeros minusculos.
  Substitui a antiga escada vertical (TierLadder). Renderizada no front a partir do catalogo
  (override do item OU escada global do settings); so com >=2 faixas. Referencia em
  `artifacts/padcom/src/pages/orcamentos/novo.tsx`.
- **Leitura por insert (AGORA/META)**: cada leitura = rotulo em Bevel grosso (`bevel-3d`) com
  LED em cima + valor em Concavo (`concave-3d`) com a PORCENTAGEM grande em cima e as SESSOES
  pequenas embaixo, sempre com ESPACO entre simbolo e numero (`- N %`, `>= N`). LED de AGORA =
  amarelo (`paxter-led-amber`); LED de META / melhor faixa = verde (`paxter-led-green`); ambos
  piscam em sincronia.
- **Cancelamento de preco (risco vermelho fino)**: preco cheio substituido por desconto recebe
  UM risco vermelho FINO e horizontal sobre o valor (overlay `absolute`, `h-[1.5px]`,
  `bg-red-500/70`, `rounded-full`, `pointer-events-none`), SUTIL — so para dar o entendimento.
  Decisao viva do CEO (18/06/2026): troca o antigo selo de proibido pelo risco fino.
- **Guias de alinhamento**: linhas empilhadas de mesmo significado alinham por colunas
  verticais via caixa de largura fixa + `flex justify-between` (token na guia esquerda, valor
  na guia direita) — formam linhas verticais imaginarias a esquerda e a direita.
- **Luz latente (LED)**: `paxter-led` + `paxter-led-on` (pulso, keyframe `paxterPulse`) /
  `paxter-led-off`. Tons: ciano (padrao), `paxter-led-amber` (AGORA), `paxter-led-green`
  (META/melhor faixa) — cor do glow via variavel `--led-glow`; mesma cadencia = sincronia.
- **Pulso de atencao (hover)**: `paxter-attention` faz o bloco piscar um outline ciano no
  hover (keyframe `paxterAttention`) SEM apagar o relevo — usa `outline`, nunca `box-shadow`.
  Reservado a casos pontuais; em bloco interativo preferir o underglow estavel.
- **Neon estavel saindo de baixo (`paxter-underglow`)**: luz ciano que sobe do RODAPE do bloco,
  ESTAVEL (nao acende/apaga), intensa e difusa (`::after` com `radial-gradient` + `blur`,
  `pointer-events-none`). Usar em bloco interativo que precisa "chamar" sem piscar — ex.: bloco
  de Sessoes. Decisao do CEO (18/06/2026): substitui o pulso piscante nesse bloco.
- **Painel de alerta clinico TRI-ESTADO (`paxter-alert`)**: o aviso de posologia tem 3 estados e
  NUNCA usa a palavra "teto" (termo PROIBIDO no contexto clinico) — fala-se "limite clinico de
  prescricao da substancia". (1) EXCEDE: vermelho com neon (`paxter-alert paxter-alert-red`) + LED
  `paxter-led-red paxter-led-on`. (2) ABAIXO (nao eficiente): ambar com neon (`paxter-alert
  paxter-alert-amber`) + LED `paxter-led-amber paxter-led-on`. (3) DENTRO da faixa terapeutica:
  VERDE calmo, SEM neon — so `bevel-3d` (segue o padrao do bevel) + texto esmeralda + LED
  `paxter-led-green` SEM `-on`. Cor do neon via `--alert-glow`. No mobile o alerta empilha
  (`flex-col` -> `sm:flex-row`). Variante `.dark` incluida.
- **Porquinho**: SVG INLINE de PERFIL, vetor achatado (nao 3D), nos tons da marca
  (verde-petroleo + ciano), sem dependencia de imagem externa. Definido direto no banner de
  desconto em `novo.tsx` (substitui o antigo PNG 3D realista).
- **Frasco-ampola (vial 2 ml)**: icone da substancia = vetor FLAT estilo frasco-ampola de ~2 ml
  no MESMO estilo do porquinho: tampa crimp em verde-petroleo, vidro claro, liquido na COR da
  substancia (`color`), brilho e marcas de medida. Componente `Ampola({ color, width })` em
  `pages/orcamentos/VitrineCard.tsx` (assinatura preservada; substitui a ampola/ampoule antiga).

### 3.1 Padroes-mae (valem para TODAS as telas de orcamento)

- **Padrao 1 — numero variavel em insert alinhado**: todo numero que MUDA (porcentagem, sessoes,
  valor) fica dentro de um insert Concavo (`concave-3d`); sempre que possivel o rotulo ao lado
  ou acima vai em Bevel com chanfro 3D (`bevel-3d`). Inserts que sao PARES (ex.: % e >= sessoes;
  AGORA e META) tem o MESMO alinhamento: mesma altura e largura, lado a lado com seus vizinhos.
- **Padrao 2 — clonar para o sistema**: estes padroes do Console de Orcamento sao a referencia
  para TODAS as telas de orcamento (Montagem, Parametrizacao, Apresentacao e futuras). Ao criar
  ou redesenhar qualquer tela de orcamento, reusar este vocabulario 3D — nao inventar estilo novo.
- **Padrao 3 — titulo de bloco em placa Saliente (`BlockTitle`)**: o titulo de cada card NAO e
  texto solto; vai numa placa Bevel (`bevel-3d`, MAIUSCULO, `tracking` expandido) com o icone
  Lucide a esquerda, na cor tematica do bloco (primary, ambar, ciano, esmeralda). A placa SALTA
  da folha — o titulo vira a "etiqueta gravada" do painel. Helper local recebe `icon`, `color`.
- **Padrao 4 — sinal de status com SLOT fixo (`StatusChip`)**: marcador on/off (ex.: VITRINE,
  LIM/MES) NUNCA aparece/some entre linhas — isso desalinha colunas. Usa-se um chip de largura
  FIXA (`concave-3d`, `w-[72px]`, `shrink-0`) SEMPRE presente: LED aceso (`paxter-led-on`, cor
  verde/ambar) quando ativo, LED apagado + `opacity-70` quando inativo. Verde = vitrine/positivo,
  ambar = restricao/limite clinico. Slot constante = linhas sempre alinhadas em coluna.
- **Padrao 5 — toggle em sulco Concavo (`ToggleWell`)**: todo `Switch` vai dentro de um well
  (`concave-3d`, `flex items-center gap-3`, `px-3 py-2.5`) com o `Label` ao lado — o controle
  parece afundado na base do painel, nunca solto na folha.
- **Padrao 6 — explicacao para leigo empilhada (`ExplainRow`)**: instrucao/ajuda NUNCA e
  paragrafo linear; e UMA ideia por linha, cada uma num insert Concavo com LED a esquerda
  (`paxter-led-on`) e o termo em negrito + frase curta. Espelha a Densidade B do CEO (uma linha,
  um assunto fechado) dentro da tela.
- **Padrao 7 — layout empilhado por assunto (lego)**: campos relacionados agrupam-se em
  sub-painel (`panel-3d-sub`) com um rotulo de secao MAIUSCULO no topo e os campos EMPILHADOS
  na vertical (`space-y-3`), nunca espremidos numa grade larga de muitas colunas. Assuntos
  distintos = sub-paineis lado a lado (ex.: "Descontos por pagamento" x "Parcelamento e plano").
- **Padrao 8 — respiro entre pecas 3D**: blocos com relevo (paineis, chips, inserts, cards de
  caminho) NUNCA se encostam. Gap minimo de 12px (`gap-3` / `space-y-4`) para a sombra externa
  "respirar"; pecas coladas matam o 3D. Ex.: inserts de taxa de cartao em `gap-3`; cards dos "3
  caminhos" em `gap-6` (acomoda o `scale-105` do recomendado); historico em `space-y-4`.
- **Padrao 9 — rotulo de multiplicador com espaco (`N x`)**: contador de parcela/repeticao
  escreve-se "N x" COM espaco (ex.: "12 x", nunca "12x"), de preferencia numa placa `bevel-3d`
  acima do campo gravado.
- **Padrao 10 — tabela alinhada ao pixel + mobile empilhado**: tabela de edicao usa o MESMO
  template de colunas (`grid-cols-[...]`) no cabecalho E nas linhas; o cabecalho leva
  `border border-transparent` para casar com a borda de 1px do `panel-3d-sub` da linha (alinha ao
  pixel). A partir de `lg` e grade de colunas; abaixo de `lg` vira formulario EMPILHADO 2-colunas
  com rotulo por campo (helper `CatCell`, rotulo `lg:hidden`), Nome em `col-span-2`. Nunca
  espremer a grade larga no celular.
- **Padrao 11 — toggle em well tambem no preview**: todo `Switch`, inclusive na tela de
  Apresentacao (preview do cliente), vai em sulco `concave-3d` (Padrao 5). Selects que acompanham
  o toggle recebem `field-engraved` para a linha inteira parecer gravada.

## 4. Console de Orcamento (referencia viva)

- `pages/orcamentos/novo.tsx` — Montagem (apresentacao). Banner de desconto: titulo
  Saliente no topo; leituras AGORA/META (Bevel grosso + LED; Concavo com % em cima e sessoes
  embaixo); botao 3D; barra de evolucao horizontal (TierTrack) pulsando a luz por detras da faixa atual.
- `pages/orcamentos/parametrizacao.tsx` — Parametrizacao (referencia viva dos Padroes 3 a 7).
  Titulos em `BlockTitle` (placa Saliente por bloco); "Descontos e Plano" em dois sub-paineis
  empilhados; "Desconto por Volume" explicado em `ExplainRow` empilhados; catalogo com nome/tipo
  em `field-engraved` e sinais `StatusChip` (VITRINE/LIM-MES) em slot fixo; toggles em
  `ToggleWell`. `TierEditor` define as faixas; "Numero de faixas" gera/encurta N inputs de %.
- A dose EXIBIDA vem do catalogo; a dose SALVA vem de `r.dose`. Diferenca proposital.
- `Apresentacao` reidrata `itemVolumeTiers` do catalogo por `catalogId` (snapshot do
  orcamento nao persiste override de faixas).

## 5. Linha vermelha (nao cruzar)

- Nao alterar `/api/budgets/calculate` nem o payload de `salvar()` por motivo estetico.
- Nao trocar cantos quadrados por arredondados infantis.
- Nao remover o relevo 3D dos paineis/sub-paineis — e a essencia.
- Ao mexer em classe 3D, mexer so no render (cor/sombra/forma), nunca na logica de dados.

RESUMO EM 1 LINHA: design Paxter = paineis 3D skeuomorficos, Saliente para a conclusao e
Concavo para o dado, cores verde-petroleo/ciano, cantos quadrados, fluxos com setas — so
apresentacao muda, o motor nunca.
