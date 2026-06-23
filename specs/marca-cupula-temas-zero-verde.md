# Spec — Marca Paxter (cúpula de vidro), temas e zero-verde nas telas internas

Decisão do CEO Dr. Caio (23/06/2026). Imagens de referência: IMG_5142 / IMG_5143.
Loop Paxter: esta spec (Fase 1) → construir só o que está aqui → architect → autoauditoria tela a tela.

## Objetivo

Padronizar a identidade Paxter (navy + ouro) em TODAS as telas internas e externas do app real
`artifacts/padcom`, com o medalhão de vidro validado, o nome PAXTER sem o brilho "craquelado",
subtítulo correto, alternância de tema claro/escuro nas telas do cliente, zero verde de marca e
mobile premium.

## Requisitos (o alvo, item a item)

| Nº | Requisito | Definição de pronto |
|---|---|---|
| R1 | Símbolo da marca em CÚPULA: moldura dourada fina + vidro perolado no aro superior + miolo NAVY, símbolo GRANDE quase encostando na moldura | `PaxterSymbolGlass` reescrito p/ a cúpula; aparece igual em sidebar, anamnese, agendar, portal, área |
| R2 | Wordmark PAXTER SEM o brilho craquelado/quebrado em volta das letras | remover `.pax-sheen` e o glint do contorno do `PaxterWordmarkPremium`; ouro limpo |
| R3 | Subtítulo = "Clinical Intelligence System" | presente e legível na sidebar, na anamnese e no agendar |
| R4 | Alternância de tema claro/escuro (botão sol/lua) nas telas do cliente: anamnese-v2 E agendar | toggle persistente (localStorage); usa tokens `.dark` já existentes |
| R5 | ZERO verde de marca nas telas: substituir literais `text-teal-*`, `bg-teal-*`, `emerald`, `#3D7A7A`, `#45B8CC` (CIANO/PETROLEO) por navy/ouro/tokens | cores de STATUS funcionais (verde=concluído, âmbar=limite, vermelho=erro, ciano=atual) preservadas (skill §4.3) |
| R6 | Mobile premium nas telas do cliente (anamnese-v2, agendar) | screenshots 360/390/430 sem reflow, dois temas |

Fora de escopo (NÃO construir nesta onda): voz/áudio/TTS, estúdio de perguntas, gravação —
o plano antigo de voz está superado.

## Abordagem (fonte única, maior alavanca primeiro)

- Onda A — componentes compartilhados (corrigem R1, R2, R3 em todas as telas de uma vez):
  reescrever `components/layout/paxter-fx/PaxterSymbolGlass.tsx` para a cúpula `.leva-medallion`
  validada (moldura ouro 2px + `::after` perolado no aro + miolo navy); remover o glint do
  `PaxterWordmarkPremium` e o `.pax-sheen` do `branding/PaxterLogo`.
- Onda B — telas do cliente (R4, R5, R6): anamnese-v2 e agendar ganham toggle de tema, navy/ouro,
  cabeçalho PAXTER + subtítulo, e layout mobile premium (referência: mockups `levaAnamnese` e
  `MarcarConsulta`).
- Onda C — varredura zero-verde (R5) nas demais telas internas: trocar literais teal/emerald de
  marca por tokens/navy/ouro, preservando cores de status.
- Onda D — architect requisito a requisito + autoauditoria por screenshot (desktop + 360/390/430,
  dois temas) até zero pendência.

## Fatos técnicos confirmados (não re-descobrir)

- Tokens centrais em `index.css` JÁ são navy (`--primary: 214 54% 19%`) + ouro (`--accent: 39 41% 51%`);
  o motor 3D (`panel-3d`, `btn-3d`) já é navy/ouro. O verde que sobra é só literal hardcoded nas páginas.
- Tema `.dark` já existe com variantes 3D completas; falta só o BOTÃO que ativa (`.dark` num ancestral).
- Cúpula validada: `.leva-medallion` em `mockup-sandbox/.../_shared/levaAnamnese.tsx` (miolo navy sempre).

## Registro obrigatório ao terminar (Lei do Registro de Modelagem)

- Corrigir o Padrão 14 da `skill-layout-paxter` (hoje descreve o vidro CHAPADO rejeitado) para a CÚPULA.
- Atualizar memória (`paxter-simbolo-glass-fonte-unica.md`) e anunciar ao CEO em Densidade B.
