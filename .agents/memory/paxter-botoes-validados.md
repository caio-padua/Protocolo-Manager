---
name: Botoes validados Paxter + armadilha do text-gold (clip)
description: Qual e o botao "validado" do CEO e por que .text-gold (background-clip) some sobre bevel-3d/btn-3d.
---

# Botao validado = sistema de design do CEO, nao palpite de subagente

O botao "validado" do CEO NAO e nenhum estilo inventado por tela (ex.: btn-premium/chip-3d
do mockup). E sempre o do seu proprio sistema de design (skill `skill-layout-paxter`):

- **Resposta nao selecionada / voltar** -> `btn-3d-soft` (tecla neutra).
- **Resposta selecionada** -> `bevel-3d` (Saliente/Bevel GROSSO, "botao alto que salta da folha").
- **Acao primaria (Continuar/Confirmar)** -> `btn-3d` (tecla petroleo, 1 por bloco).
- **Aceite terminal** -> `btn-3d-ok` (verde, so apos aceitar).

**Why:** o CEO repetiu "bevel com o sobressalente bem alto / altura alta"; o padrao real
do app (anamnese-v2) usa exatamente `selected ? "bevel-3d" : "btn-3d-soft"`. Um subagente
explorer JA ERROU ao "deduzir" que btn-premium era o aprovado — confiar nisso gerou rejeicao.
**How to apply:** antes de montar qualquer botao/tela, ler skill-layout-paxter +
references/componentes-3d.md; o CSS canonico vive em `artifacts/padcom/src/index.css`
(classes UNLAYERED de proposito). Em mockup-sandbox, portar o CSS de la para `_shared/`
e ativar `dark` no root quando for tela do paciente (fundo navy).

# Armadilha: .text-gold (background-clip:text) SOME sobre fundo concorrente

`.text-gold` pinta o texto com `background: gradiente + background-clip:text +
-webkit-text-fill-color: transparent`. Ou seja, o texto vira "janela" para o BACKGROUND
do proprio elemento.

**Why:** se o MESMO elemento tambem tem `bevel-3d`/`btn-3d` (que definem `background`),
a regra de fundo mais especifica (ex.: `.dark .bevel-3d`, specificity 0,2,0) vence
`.text-gold` (0,1,0); o texto e recortado no fundo TEAL/navy e fica invisivel. O icone
(SVG stroke=currentColor) continua aparecendo, mascarando o bug. Funciona em
"CONTINUAR" porque la `text-gold` esta num `<span>` filho, sem background concorrente.
**How to apply:** nunca por `text-gold` direto num elemento que ja tem fundo 3D; use
dourado SOLIDO (ex.: `text-[#e9cf8f]`) no elemento, ou ponha `text-gold` num filho sem fundo.

# Armadilha: bg-primary/text-primary-foreground por cima de btn-3d "engrossa" o botao

CTA validado e `btn-3d` (gradiente navy/ouro) + `text-white` (+ uppercase/tracking). Se a
classe Tailwind `bg-primary` (e `text-primary-foreground`) for somada ao mesmo elemento, o
botao fica chapado/"grosseiro" e perde o degrade premium — foi exatamente o "botao Proximo
estranho" que o CEO reclamou na anamnese.

**Why:** `bg-primary` pinta um fundo solido que compete com o gradiente do `btn-3d`; o
resultado e um navy chapado sem relevo. O padrao validado (portao "Continuar") NUNCA usa
`bg-primary`: so `btn-3d` + `text-white`.
**How to apply:** em qualquer CTA com `btn-3d`, remover `bg-primary`/`text-primary-foreground`
e usar `text-white`. Mesma logica para selecao "suave" (escala/chips): ativo = degrade
`hsl(var(--primary)/0.95->0.78/0.80)` + anel ouro 2px (nao `hsl(var(--primary))` solido).
