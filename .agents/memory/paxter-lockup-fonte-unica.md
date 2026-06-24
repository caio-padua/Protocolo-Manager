---
name: Lockup PAXTER de fonte única (frase 3D via headline raster)
description: Como montar o conjunto da marca PAXTER (símbolo+nome+frase) com luz, de fonte única, sem texto chapado.
---

# Lockup PAXTER — fonte única + frase 3D real

Regra: o conjunto da marca (símbolo de vidro + nome PAXTER + frase "Clinical Intelligence
System") é montado SEMPRE por um único componente `PaxterLockup`
(`layout/paxter-fx/PaxterLockup.tsx`). Nenhuma tela monta o conjunto à mão.

**Why:** o CEO exige o conjunto completo COM a luz em todas as telas e proibiu a frase como
texto chapado/estampado. Montagens manuais paralelas (em `branding/PaxterLogo`, em `BrandMark`
da anamnese-v2, no header de `agendar`) divergiam: umas usavam `PaxterTextShimmer` (texto plano)
para a frase, quebrando o requisito "frase tem o MESMO acabamento 3D do nome". O architect dá
FAIL enquanto sobrar QUALQUER bypass renderizando a frase como texto.

**How to apply:**
- A frase 3D NÃO existe como asset isolado. Ela vem da arte oficial `paxter-headline.png`
  (PAXTER + frase no MESMO bisel 3D). `PaxterHeadlineArt` usa essa arte; a luz passa por cima
  recortada pela máscara e percorre nome+frase numa única passada (estão na mesma imagem).
- A máscara `paxter-headline-clean.png` é gerada da headline binarizando o canal alpha (remove a
  sombra suave), mesma lógica do par `paxter-paxter` / `paxter-paxter-clean`:
  `magick paxter-headline.png -channel A -threshold 55% +channel paxter-headline-clean.png`
  (sharp não está no root; ImageMagick `magick`/`convert` está).
- Motor da luz é ÚNICO: `PaxterRasterGlow` (spark+sweep+breath, mix-blend screen, máscara da arte
  limpa, prefers-reduced-motion off). `PaxterWordmarkArt` (só nome) e `PaxterHeadlineArt`
  (nome+frase) são wrappers finos do MESMO motor — nunca forkar (ver paxter-glint-motor-unico).
- Tom claro: a face é a arte LIMPA em blend normal (ouro 3D legível no creme); a luz screen fica
  naturalmente sutil/invisível no fundo claro — isso é limitação física do screen, não defeito.
- Único estado sem frase legítimo = sidebar COLLAPSED (rail recolhido, só cabe o símbolo).
- Ao mudar a marca, faça varredura de USO (não só de import) por `PaxterTextShimmer` e
  `PaxterWordmarkPremium` em `src/pages` e nos dois `PaxterLogo` — eles não podem aparecer em tela
  de produto.
