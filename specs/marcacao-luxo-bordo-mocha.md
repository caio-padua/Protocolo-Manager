# Spec — Marcação de Consultas/Exames em pele de LUXO (Atelier bordô/mocha + ouro)

## Objetivo (uma frase)
Transformar a tela de marcação de consultas/exames (`/agendar`) numa experiência de LUXO tipo
atelier Rolls-Royce/Hermès — base bordô/mocha com textura de linho, painéis superiores com textura
granular (couro), ferragens em ouro, e dados em posição FIXA (Grade Imaginária) — sem tocar no motor
de agendamento.

## Conceito criativo
"ATELIÊ" — couro e linho de alta costura automotiva: base profunda vinho/expresso (bordô + mocha),
linho tecido (linhas grossas cruzadas) no painel base, grão de couro (granular) nos painéis de cima,
e ferragem dourada (molduras finas, fios, selos) como joia. Precisão de relojoaria no alinhamento.

## Requisitos exatos
1. NOVO tom escuro: trocar o navy frio atual (`bg-[#0b1a33]` do fluxo Dr. Caio e do sucesso) por um
   escuro QUENTE de luxo — base expresso/mocha com pigmento bordô. Aplicar no tema escuro da tela.
2. Textura de LINHO no painel BASE (fundo da tela / painel inferior): traçado de linhas grossas
   cruzadas simulando tecido de linho, sutil, sem competir com o conteúdo.
3. Textura GRANULAR (grão de couro) nos painéis SUPERIORES (cartões/painéis sobre a base).
4. Ferragem em OURO: molduras finas, fios/filetes e selos em dourado nos cartões e títulos; bordas
   em bordô. Ouro nunca em texto pequeno sobre fundo claro concorrente (regra da skill).
5. Grade Imaginária: dados em posição FIXA — nome em 1 linha com `truncate`; campos com slot e "—"
   quando vazios; listas em colunas fixas (`grid-cols`), nunca `flex-wrap`. Mudar o tamanho do nome
   NÃO pode empurrar nada de lugar.
6. Reusar o motor 3D do layout interno (apelido Console): classes `panel-3d`, `bevel-3d`,
   `concave-3d`, `screen-3d` do `index.css` (a essência skeuomórfica), agora vestidas de luxo.
7. Manter o toggle de tema claro/escuro já existente; a pele de luxo é a versão ESCURA.
8. Mobile premium (360/390/430) sem reflow.
9. Cores de STATUS preservadas (verde=ok, âmbar=limite, vermelho=erro, ciano=etapa atual).

## Casos extremos a tratar
- Nome muito longo do cliente/profissional não pode quebrar layout (truncate + slot fixo).
- Lista de horários vazia: estado vazio elegante, mesma moldura.
- Tema claro continua legível (linho/granular suaves no claro, não só no escuro).
- Contraste de texto sobre bordô/mocha escuro deve passar leitura (texto claro/champanhe).

## Definição de PRONTO
- Screenshots desktop + 360/390/430, tema escuro (luxo) E claro, das 3 etapas (menu, fluxo de
  agendamento, sucesso) sem reflow e com as texturas visíveis.
- Nenhum dado muda de posição ao variar o tamanho do nome (conferível trocando um nome curto por longo).
- `architect` aprova requisito a requisito contra esta spec, zero pendência.

## Linhas vermelhas (NÃO cruzar)
- NÃO tocar no motor de agendamento: hooks `useGetAgendaSlots`, `useCreateSchedulingRequest`,
  `useListSchedulingAreas/Professionals`, nem a lógica de slots/datas.
- NÃO mudar o navy do layout interno (Console / Tela 1). Esta pele de luxo é a Tela 3 (cliente
  externo, escuro) — navy do sistema interno fica intacto.
- NÃO alterar payload de API por estética.
- Manter o símbolo na cúpula (PaxterSymbolGlass) e o wordmark limpo (Padrão 14 / pivot navy-ouro).
