---
name: Marca PADCON = desenho oficial recortado (nao texto, nao placa)
description: Como renderizar a marca PADCON (empresa de engenharia) com fidelidade — diferente do PAXTER.
---

# PADCON na UI = o DESENHO OFICIAL recortado, nunca texto digitado

Decisão do CEO (Dr. Caio): quando aparecer a marca **PADCON** (a empresa de
engenharia, no crédito "Engineered by"), tem que ser o **desenho oficial real**
(logo ouro), não a palavra digitada e não sobre placa.

**Distinção importante:**
- **PAXTER** = wordmark VETOR (desenhado, Cinzel + ouro 3D via clip). É o sistema.
- **PADCON** = recorte da ARTE OFICIAL (`attached_assets/LOGO_PADCON_17_(oficial)_*.png`),
  com fundo removido (PNG transparente), renderizado FLUTUANDO (sem placa/painel).
  Não existe vetor traçado fiel (potrace saiu ondulado e foi abandonado); por isso
  a fonte de verdade é a imagem oficial recortada, não letras digitadas.

**Implementação atual:** recorte da palavra PADCON da arte oficial -> remove fundo ->
`artifacts/padcom/src/assets/padcon-wordmark.png` (transparente) -> componente
`PadconWordmark.tsx` renderiza `<img height=...>` (prop `height`), importando o asset
via `@/assets/...` para o Vite resolver a URL.

**Why:** o CEO rejeitou explicitamente (1) texto digitado "PADCON", (2) marca sobre
placa navy, (3) subtítulo "Atendimento clínico" sob "Instituto Pádua". Exige o
desenho real.

**How to apply:** reusar `PadconWordmark` (imagem) em qualquer crédito PADCON; nunca
recriar com texto/clip de gradiente; nunca pôr placa atrás; se precisar de versão
maior, gerar recorte da arte oficial (símbolo + wordmark) e remover fundo de novo.
