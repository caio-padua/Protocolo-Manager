---
name: skill-layout-paxter
description: "Sistema de design Paxter (Padcon Conect / PADCOM). Linguagem visual skeuomorfica 3D, vocabulario oficial (Saliente/Bevel, Concavo/Well, Painel 3D), tokens da marca e padroes do Console de Orcamento. Ler ANTES de criar ou redesenhar qualquer tela do Manager para manter a essencia 3D."
---

# Skill Layout Paxter — Sistema de Design (Padcon Conect)

Linguagem visual do Manager, definida pelo CEO Dr. Caio. Mantida pelo Dr. Replit Paxter.
Regra mae: **nunca perca a essencia dos paineis e sub-paineis 3D. So incorpore beneficios.**
Toda mudanca e de APRESENTACAO; o motor de calculo e o payload de salvar nunca mudam por estetica.

## 0. Arquivos de referencia (ler conforme a tarefa)

| Arquivo | Quando ler |
|---|---|
| `references/componentes-3d.md` | criar/redesenhar qualquer botao/controle 3D (receita + JSX de cada um) |
| `references/alinhamento-espacamento.md` | alinhar por linhas-guia visiveis e definir espacamento (respiro 3D) |
| `references/revisao-final.md` | ao TERMINAR uma tela: checklist "como cliente" + paridade celular x desktop |
| `references/grade-imaginaria.md` | construir QUALQUER card ou lista de itens (modelo mental de zonas, anti-padroes, receita JSX, checklist de 10 pontos) — ler ANTES de criar card/linha nova em QUALQUER sistema |

Fluxo de uso: para card/lista -> ler `references/grade-imaginaria.md` PRIMEIRO -> escolher controle por
INTENCAO (secao 4) -> montar com receita (`componentes-3d.md`) -> alinhar e espacar
(`alinhamento-espacamento.md`) -> revisar como cliente e conferir celular x desktop (`revisao-final.md`).

## 0.1 Lei do Registro de Modelagem (OBRIGATORIA)

Decisao do CEO (20/06/2026): o CEO vai construir dezenas ou centenas de sistemas e TODOS herdam
ESTA mesma linguagem visual. Por isso nenhum padrao novo pode ficar so no codigo de uma tela — tem
que virar regra ESCRITA aqui, senao nao se propaga aos primos (IHE, futuros sistemas).

| Passo | O que fazer | Quando |
|---|---|---|
| 1. LER | Ler esta skill (e a referencia da tarefa) ANTES de criar/redesenhar qualquer tela. | Inicio |
| 2. REUSAR | Escolher controle por INTENCAO (secao 4); nunca inventar estilo novo por tela. | Construcao |
| 3. REGISTRAR | Padrao NOVO (ou decisao de design aprovada pelo CEO) vira: vocabulario (secao 1), token (secao 2), Padrao numerado (secao 3) ou linha na tabela de intencao (secao 4). | ANTES de dar a tela por pronta |
| 4. ANUNCIAR | Avisar o CEO do que entrou na skill (e, se for diretriz/metodo, promulgar artigo no Codigo Paxter). | Ao registrar |

Regra-mae: a SKILL e a fonte-da-verdade do design; o codigo da tela e so a APLICACAO dela. Tela
pronta sem o padrao novo registrado = trabalho incompleto.

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

PIVOT NAVY/OURO (lei promulgada em 23/06/2026): a marca Paxter passou a ser **navy + ouro**. O
verde-petroleo (`#3D7A7A`) e o ciano (`#45B8CC`) SAIRAM do chrome de marca. As classes 3D do
`index.css` (`btn-3d`, `panel-3d`, `bevel-3d`, etc.) ja foram reapontadas para navy/ouro — por isso,
onde as tabelas abaixo dizem "verde-petroleo", LEIA navy: a CLASSE e a fonte-da-verdade, o nome da
cor e legado. Verde, ambar, vermelho e ciano sobrevivem SO como cor de STATUS (ver 4.3), nunca como
chrome de marca.

| Token | Valor | Uso |
|---|---|---|
| Navy (primary) | `#16284a` | Sidebar, headers, CTA primario, titulos, barras preenchidas |
| Ouro (accent) | dourado 3D (clip + text-shadow) | Wordmark, molduras, aneis, selos, realce premium |
| Ciano | `#45B8CC` / `hsl(187 72% 48%)` | SO status "etapa atual" / foco; nunca chrome de marca |
| Verde / ambar / vermelho | tailwind green / amber / red | SO status: concluido / limite / erro |
| Branco | `#FFFFFF` | Fundo de paineis claros |
| Cantos | radius 6px a 8px (`0.25rem`–`0.375rem`) | SEMPRE quadrados; nunca pill/arredondado infantil |
| Labels KPI | MAIUSCULO + `tracking` expandido | Rotulos de indicador |

Toggle quadrado (decisao do CEO, 19/06/2026): o `Switch` usa cantos bem quadrados — trilho
`rounded-[3px]`, thumb `rounded-[2px]`, nunca a pilula arredondada padrao. Mexer so no componente base
`artifacts/padcom/src/components/ui/switch.tsx`, que propaga a todos os toggles do sistema.

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
  (`h-7`, `flex-1`), SEM espaco entre simbolo e numero (`-N%`, `>=N`, colado) em `whitespace-nowrap`
  e fonte legivel (`text-[11px]`) — nunca numeros minusculos. Decisao do CEO (19/06/2026): o
  numero gruda no simbolo (antes havia espaco).
  Substitui a antiga escada vertical (TierLadder). Renderizada no front a partir do catalogo
  (override do item OU escada global do settings); so com >=2 faixas. Referencia em
  `artifacts/padcom/src/pages/orcamentos/novo.tsx`.
- **Leitura por insert (AGORA/META)**: cada leitura = rotulo em Bevel grosso (`bevel-3d`) com
  LED em cima + valor em Concavo (`concave-3d`) com a PORCENTAGEM grande em cima e as SESSOES
  pequenas embaixo, sempre SEM espaco entre simbolo e numero (`-N%`, `>=N`, colado). LED de AGORA =
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
- **Painel de alerta clinico TRI-ESTADO (`paxter-alert`)**: o aviso de posologia tem 3 estados com a
  MESMA fala-base "limite terapeutico" + a FAIXA entre parenteses (por extenso, "por mes") nos 3
  estados — decisao do CEO em 19/06/2026 (antes cada estado tinha frase DIFERENTE: "limite clinico de
  prescricao", "efeito terapeutico", "faixa terapeutica"; a palavra "teto" continua PROIBIDA no
  contexto clinico). (1) ACIMA — "Acima do limite terapeutico (N a M por mes)": vermelho com neon
  (`paxter-alert paxter-alert-red`) + LED `paxter-led-red paxter-led-on`, acao a direita "Espace para
  no minimo X dias". (2) ABAIXO — "Abaixo do limite terapeutico (N a M por mes)": ambar com neon
  (`paxter-alert paxter-alert-amber`) + LED `paxter-led-amber paxter-led-on`, acao "Use no maximo X
  dias entre aplicacoes". (3) DENTRO — "Dentro do limite terapeutico (N a M por mes)" + acao
  "Posologia no alvo": verde calmo SEM neon, MAS com fundo verde via classe UNLAYERED companheira
  `bevel-3d bevel-3d-ok` (NAO usar `bg-emerald-50`, que perde para o bevel unlayered) para APARECER
  claramente — antes era so `bevel-3d` + texto esmeralda e "sumia" no desktop (queixa do CEO). LED
  `paxter-led-green` SEM `-on`. A faixa entre parenteses
  degrada para "ate M por mes" (so max) ou "a partir de N por mes" (so min). Cor do neon via
  `--alert-glow`. No mobile o alerta empilha (`flex-col` -> `sm:flex-row`). Variante `.dark` incluida.
- **LINGUAGEM DE ESTADO (glow raro e intencional)** — calibracao promulgada em 21/06/2026 (queixa do
  CEO de "luzes muito expandidas" + diagnostico do Dr. Chat). REGRA: o glow NAO e decoracao global; um
  bloco so "acende" quando ha ESTADO REAL (atencao, atraso, alerta, sucesso) ou no HOVER de desktop.
  No celular nunca depende de hover. O relevo 3D nunca e apagado — calibra-se so a LUZ (blur, alcance,
  opacidade), nunca o bevel. Classes e quando usar:
  | Classe | Quando acende | Cor (significado unico, secao 4.3) |
  |---|---|---|
  | `pw-hover-luxury` | hover de desktop apenas (tem guarda `@media (hover:none)`) | luz neutra/ciano discreta |
  | `is-attention` | bloco pede atencao agora | ambar |
  | `has-side-beacon` + `beacon-amber`/`beacon-red`/`beacon-green`/`beacon-blue` | farol lateral de estado | ambar=atencao, vermelho=atraso/critico, verde=sucesso, ciano=info/foco |
  | `pw-urgent` (keyframe `pwUrgent`) | urgencia real que precisa pulsar | vermelho |
  Calibracao aplicada (referencia): `paxter-underglow::after` mais calmo; `paxter-alert` glow de
  18px/2px -> 10px/1px e opacidade .55 -> .42 (claro e escuro); `neon-hover::after` reduzido. ANTES de
  criar classe de luz nova, reusar estas + `paxter-underglow`/`paxter-attention`/`paxter-alert`/LEDs.
- **Porquinho**: SVG INLINE de PERFIL, vetor achatado (nao 3D), nos tons da marca
  (verde-petroleo + ciano), sem dependencia de imagem externa. Definido direto no banner de
  desconto em `novo.tsx` (substitui o antigo PNG 3D realista).
- **Ampola injetavel (vidro OPC)**: icone da substancia = vetor FLAT de uma AMPOLA classica
  injetavel (NAO frasco): ponta de quebra no topo, haste estreita, ANEL DE QUEBRA colorido na COR
  da substancia (`color`), bulbo, ombro e corpo cilindrico com liquido (cor da substancia) +
  menisco, anel de graduacao e brilhos de vidro nos tons da marca. Componente
  `Ampola({ color, width })` em `pages/orcamentos/VitrineCard.tsx` (assinatura preservada;
  substitui o frasco-ampola/vial anterior, reprovado pelo CEO em 19/06/2026).
- **Concordancia de direcao da frequencia (FrequencyDial)**: a barra de frequencia mede
  EFICIENCIA (mais frequente = barra mais cheia para a DIREITA). Por isso a seta da DIREITA
  ENCURTA o intervalo (mais frequente, barra cresce) e a da ESQUERDA AUMENTA o intervalo (menos
  frequente, barra recua). Setas, barra segmentada, teclado e arraste apontam todos no mesmo
  sentido — nunca deixar a seta brigar com o crescimento da barra.
- **Defaults clinicos ao abrir a Montagem**: substancia entra com 8 sessoes e 1x por semana
  (`frequencyDays` 7); dieta, formula e consulta entram com 1 sessao. Vem do catalogo
  (`budget_catalog`), entao Vitrine e Apresentacao herdam o mesmo default. O proprio default
  semanal NAO pode disparar alerta de "excede": substancias semanais com limite usam
  `maxAplicacoesMes` 5 (min 6 dias) para 7 dias passar com folga (decisao do CEO em 19/06/2026,
  estendida tambem a Tirzepatida).

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
  LIMITES) NUNCA aparece/some entre linhas — isso desalinha colunas. NUNCA usar "TETO/MES" (palavra
  "teto" proibida no contexto clinico). Usa-se um chip de largura
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
  caminhos" em `gap-6` (acomoda o `scale-105` do recomendado); lista/historico de orcamentos em
  `space-y-5` com cada linha em `p-4` (decisao do CEO em 19/06/2026: estava amontoado em `space-y-4`/`p-3`).
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
- **Padrao 12 — POSICAO FIXA + CAMPO VAZIO ROTULADO (lei promulgada pela Agenda Semanal,
  19/06/2026) — ver `references/grade-imaginaria.md` (modelo completo, receita JSX, checklist)**: vale para TODAS as telas do sistema, nao so orcamento. Todo dado de um card/linha
  ocupa um SLOT em posicao FIXA: o olho do CEO (TDAH) sempre acha o mesmo dado no mesmo lugar,
  card a card. (a) NUNCA usar `flex-wrap` para os dados-chave do cabecalho — `flex-wrap` faz a
  posicao deslizar conforme o tamanho do texto. Em vez disso, ancorar: titulo (nome) `truncate`
  numa coluna `min-w-0` a esquerda e o sinal/status com `shrink-0` na direita
  (`flex items-start justify-between`). (b) Campo opcional NUNCA some: renderiza-se sempre o slot
  com seu rotulo MAIUSCULO; quando vazio, mostra-se um placeholder neutro ("—"), nunca se remove a
  linha (remover desloca todos os campos abaixo). Helper canonico `MetaField({label, value, icon})`:
  rotulo em `bevel`/uppercase fixo + valor gravado ou "—". Grade de slots = `grid` de N colunas
  fixas (`grid-cols-2 lg:grid-cols-3`), nao `flex-wrap`.
- **Padrao 13 — LINHA DE ITEM EM COLUNAS FIXAS COM SULCO (lei promulgada pela Agenda Semanal,
  19/06/2026) — ver `references/grade-imaginaria.md` (template de colunas + receita comentada)**: lista de itens repetidos (substancias, parcelas, exames) usa UM `grid` de template
  de colunas FIXO (`grid-cols-[14px_minmax(0,1fr)_0.75rem_3rem_4.5rem_2rem]` e similares) para que
  TODAS as linhas aliem ao pixel. Cada coluna tem funcao unica e ordem estavel: (1) QUADRADINHO de
  COR identitario (`h-3.5 w-3.5 rounded-[3px] ring-1`, cor da entidade) — cor pertencendo ao ITEM
  e quadradinho, NUNCA LED (LED so para status on/off binario, Padrao 4); (2) nome `truncate`;
  (3) SULCO concavo divisor (`w-px bg-foreground/15` com realce 3D) separando blocos de colunas;
  (4) numeros tabulares alinhados a direita; (5) estado em texto curto centralizado; (6) controle
  (CAIXINHA `Checkbox` para marcar/confirmar — a palavra "CONFIRMAR" como botao-texto fica
  proibida; usa-se a caixinha, individual e "marcar todas"). Acoes em massa (lupa expandir/recolher,
  "marcar todas") ficam numa barra de altura fixa (`min-h`) acima da lista, para nao empurrar as
  linhas. Todo `Checkbox` sem texto visivel ao lado recebe `aria-label` descritivo.
- **Padrao 14 — SIMBOLO DA MARCA EM MEDALHAO DE VIDRO (lei promulgada em 23/06/2026)**: o
  simbolo premium do Paxter (aura+faixa+faisca) NUNCA aparece cru nem dentro de um quadradinho
  improvisado; vai SEMPRE dentro do medalhao de vidro nitido, por UMA fonte unica:
  `components/layout/paxter-fx/PaxterSymbolGlass.tsx`. Props: `size` (px do simbolo; padding e
  raio escalam sozinhos) e `tone` — `dark` (vidro navy translucido, para QUALQUER fundo escuro:
  sidebar, headers navy, splash) e `light` (vidro champanhe um tom ACIMA do painel, SO em
  fundo claro). O `tone` vai no wrapper, nunca no simbolo. Vale para TODOS os simbolos da marca,
  internos e externos (sidebar, anamnese, /anamnese/v2, portal, area, agendar, entrada). UNICA
  EXCECAO: o SITE publico (`abertura.tsx`, variant `hero` do lockup) segue chapado (sem vidro),
  por ser a superficie "cartaz". Acessibilidade: o simbolo e DECORATIVO (`aria-hidden` + `alt=""`);
  ele sempre acompanha o texto "PAXTER" visivel, que ja carrega o nome ao leitor de tela — nao
  duplicar com `alt="PAXTER"`.

## 4. Catalogo de Controles por Intencao (botao x toggle x acao)

Paradigma travado pelo CEO (19/06/2026): cada INTENCAO tem UM controle e UMA cor. Ao criar ou
redesenhar QUALQUER tela, escolher o controle pela intencao nestas tabelas e reusar — nunca inventar
estilo novo por tela. Esta secao e a fonte-da-verdade para propagar o design Paxter as demais paginas.

### 4.1 Botoes por intencao

| Intencao (o que o clique faz) | Componente / Classe | Cor | Regra de uso |
|---|---|---|---|
| Acao primaria (avancar, salvar, confirmar, lancar) | `Button` + `btn-3d` | verde-petroleo cheio | so 1 por bloco; e o CTA principal; afunda no `:active` |
| Acao secundaria / escolha neutra (escolher 1 entre varios, voltar, alternativa) | `Button` + `btn-3d-soft` | claro/neutro | TODOS os pares iguais — nunca colorir so um (parece "ja escolhido") |
| Estado terminal positivo (aceito, concluido, confirmado) | `Button` + `btn-3d-ok` | verde sucesso + check | SO apos a acao feita; nunca como CTA inicial |
| Incremento dentro de banner (adicionar N sessoes) | `Button` + `btn-3d` | verde-petroleo | vive dentro do `incentive-banner`; texto "Adicionar N sessoes" |
| Acao destrutiva (excluir, remover) | `Button` + `btn-3d` em tom vermelho | vermelho | pede confirmacao antes; nunca verde |
| Acao textual leve / inline (eu digito, editar, link) | botao texto + icone Lucide | muted -> ciano no hover | SEM relevo; sutil; nao compete com o CTA |
| Stepper (+ / -, setas de incremento) | par de `Button` quadrados | neutro | a DIRECAO concorda com a barra que controla (ver concordancia da frequencia, secao 3) |

### 4.2 Toggles e selecao de estado

| Intencao | Componente | Padrao | Regra |
|---|---|---|---|
| Liga/desliga uma opcao editavel | `Switch` | ToggleWell (`concave-3d` + `Label` ao lado, `px-3 py-2.5`) — Padrao 5/11 | sempre afundado no sulco; vale tambem no preview/Apresentacao |
| Status on/off so LEITURA (VITRINE, LIMITES) | StatusChip — Padrao 4 | slot fixo `concave-3d w-[72px] shrink-0` + LED | SEMPRE presente (nunca aparece/some): LED aceso = ativo; apagado + `opacity-70` = inativo |
| Selecionar 1 entre N (cenario, faixa) | cartao / `Button` `btn-3d-soft` | todos iguais; recomendado por MOLDURA + selo, NAO por cor de botao | a cor do botao nunca carrega "recomendado" nem "aceito" |

### 4.3 Cor -> significado unico (nunca reaproveitar a cor para 2 sentidos)

| Cor | Significado UNICO | Onde aparece |
|---|---|---|
| Verde-petroleo cheio (botao) | acao primaria disponivel | `btn-3d` |
| Verde sucesso (+ check / LED verde) | estado terminal: aceito / concluido / dentro do alvo | `btn-3d-ok`, `paxter-led-green`, alerta "dentro" |
| Ciano | item ATUAL / foco / destaque | halos, anel de foco, barra acesa |
| Ambar | restricao / limite / atencao | `paxter-alert-amber`, `paxter-led-amber`, StatusChip de limite |
| Vermelho | excede / erro / destrutivo | `paxter-alert-red`, `paxter-led-red`, botao destrutivo |
| Neutro claro | acao secundaria / escolha em aberto | `btn-3d-soft` |
| Verde-petroleo em MOLDURA + sombra + selo | "recomendado para voce" (sem encher o botao) | cartao de cenario recomendado (Apresentacao) |

Regra-mae da cor: existem DOIS verdes e eles NAO se misturam — verde-PETROLEO cheio (`btn-3d`) =
acao primaria disponivel; verde-SUCESSO esmeralda cheio (`btn-3d-ok`) = aceito/feito. Recomendacao
NUNCA usa o verde-sucesso cheio: marca o recomendado por MOLDURA + selo em relevo, senao o cliente
acha que ja aceitou (decisao do CEO no redesenho dos cards de pagamento da Apresentacao).

Nota tecnica (relevo 3D vence Tailwind): as classes de relevo (`bevel-3d`, `panel-3d`, etc.) ficam
SEM `@layer` de proposito e por isso sobrepoem utilitarios `bg-*`/`border-*` do Tailwind. Para tingir
um bloco em relevo (ex.: alerta "dentro do alvo" verde) NAO adianta por `bg-emerald-50` — crie/use
uma classe unlayered companheira (ex.: `bevel-3d-ok`) que sobrescreve so `background`/`border-color`.

## 5. Console de Orcamento (referencia viva)

- `pages/orcamentos/novo.tsx` — Montagem (apresentacao). Banner de desconto: titulo
  Saliente no topo; leituras AGORA/META (Bevel grosso + LED; Concavo com % em cima e sessoes
  embaixo); botao 3D; barra de evolucao horizontal (TierTrack) pulsando a luz por detras da faixa atual.
- `pages/orcamentos/parametrizacao.tsx` — Parametrizacao (referencia viva dos Padroes 3 a 7).
  Titulos em `BlockTitle` (placa Saliente por bloco); "Descontos e Plano" em dois sub-paineis
  empilhados; "Desconto por Volume" explicado em `ExplainRow` empilhados; catalogo com nome/tipo
  em `field-engraved` e sinais `StatusChip` (VITRINE/LIMITES) em slot fixo; toggles em
  `ToggleWell`. `TierEditor` define as faixas; "Numero de faixas" gera/encurta N inputs de %.
- A dose EXIBIDA vem do catalogo; a dose SALVA vem de `r.dose`. Diferenca proposital.
- `Apresentacao` reidrata `itemVolumeTiers` do catalogo por `catalogId` (snapshot do
  orcamento nao persiste override de faixas).

## 6. As tres telas-mae (peles de layout do sistema)

Decisao do CEO (23/06/2026): o sistema tem TRES layouts-mae ("peles"). Toda tela nova NASCE de uma
delas — nunca um layout avulso. O motor 3D skeuomorfico e a marca sao os mesmos nas tres; o que muda
e O PUBLICO (quem usa) e o AMBIENTE (claro/escuro, densidade). Nomear cada tela e conceitua-la AQUI
e pre-requisito para construir/redesenhar qualquer pagina.

| Nº | Nome OFICIAL | Apelido (entre parenteses) | Quem usa | Ambiente |
|---|---|---|---|---|
| 1 | layout do sistema interno | (Console) | equipe que OPERA (medico, enfermagem, administrativo) | sidebar navy fixa + conteudo claro; alta densidade operacional |
| 2 | a denominar (proxima) | — | cliente/paciente (externo) | claro (anamnese clara) |
| 3 | a denominar | — | cliente/paciente (externo) | escuro (anamnese escura) |

### 6.1 Tela 1 — layout do sistema interno (apelido: Console)

REFORCO (CEO 23/06/2026): o nome OFICIAL desta tela e **"layout do sistema interno"**. A palavra
**"Console" e SO um apelido informal, sempre entre parenteses** — nunca usar "Console" como nome
oficial nem batizar a tela so de "Console".

| Atributo | Definicao |
|---|---|
| Quem usa | A equipe que OPERA o sistema (medico, enfermagem, administrativo, financeiro) — nunca o cliente |
| Estrutura | Sidebar navy ESCURA fixa a esquerda (lockup PAXTER puro no topo + menu) + area de conteudo CLARA a direita |
| Densidade | ALTA — painel operacional com muitos KPIs, cards, listas e tabelas |
| Tom de cor | Navy (sidebar) + creme/branco (conteudo); ouro SO na marca; relevo 3D skeuomorfico (a essencia) |
| Exemplos vivos | "Painel de Controle / Visao geral operacional"; Dashboard; Console de Orcamento (secao 5) |

## 7. Linha vermelha (nao cruzar)

- Nao alterar `/api/budgets/calculate` nem o payload de `salvar()` por motivo estetico.
- Nao trocar cantos quadrados por arredondados infantis.
- Nao remover o relevo 3D dos paineis/sub-paineis — e a essencia.
- Ao mexer em classe 3D, mexer so no render (cor/sombra/forma), nunca na logica de dados.

RESUMO EM 1 LINHA: design Paxter = paineis 3D skeuomorficos, Saliente para a conclusao e
Concavo para o dado, cores verde-petroleo/ciano, cantos quadrados, fluxos com setas — so
apresentacao muda, o motor nunca.
