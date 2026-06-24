---
name: Marca PAXTER — molde visual e codigos
description: Catalogo numerado das 4 pecas oficiais de logo (loginho com vidro e logo sem vidro), com fundos, uso e referencia de codigo. Fonte unica de "qual logo usar onde".
---

# Marca PAXTER — molde visual

Decisao do CEO (24/06/2026): a marca tem duas familias — **loginho** (logo COM vidro) e
**logo** (SEM vidro). O texto e sempre PAXTER + "Clinical Intelligence System"; o loginho
acrescenta "Precision in integrative care". Nunca redesenhar a logo (Opcao A travada com o
Dr. Chat): usar os assets aprovados e os componentes vivos abaixo.

## Catalogo (imagem)

Folha-catalogo numerada: `molde-paxter.png` (neste mesmo diretorio).
Pecas individuais: `01-...png` a `04-...png`.

| Num | Peca | Vidro | Fundo | Texto | Uso |
|---|---|---|---|---|---|
| 01 | Logo | Nao | Preto | PAXTER + Clinical Intelligence System | Fundo escuro chapado |
| 02 | Logo | Nao | Branco | PAXTER + Clinical Intelligence System | Fundo claro chapado |
| 03 | Loginho | Sim | Sistema (navy) | PAXTER + Clinical Intelligence System + Precision in integrative care | Cabecalho do app / telas escuras |
| 04 | Loginho | Sim | Bege (champanhe) | PAXTER + Clinical Intelligence System + Precision in integrative care | Pagina da anamnese clara |

## Onde esta o codigo de cada peca

| Num | Componente / asset (no app `artifacts/padcom/src`) |
|---|---|
| 01 e 02 | `components/branding/PaxterLogo.tsx` (variant `hero`) · simbolo `assets/paxter-symbol.png` · texto `assets/brand/paxter-headline.png` |
| 03 | `components/layout/paxter-fx/PaxterSymbolGlass.tsx` (tone `dark`) dentro de `components/branding/PaxterLogo.tsx` (variant `appHeader`) |
| 04 | `components/layout/paxter-fx/PaxterSymbolGlass.tsx` (tone `light`) dentro de `components/branding/PaxterLogo.tsx` (variant `appHeader`, tone `light`) |

Efeitos (sol/brilho + faisca da polvora): `components/layout/paxter-fx/` (PaxterSymbolGlass,
PaxterSymbolPremium, traceFlash). Strings oficiais da marca: `src/lib/brand.ts`.

## Tom do fundo bege (peca 04)

Gradiente warm linen escolhido para a anamnese clara:
`linear-gradient(160deg,#efe6d2 0%,#e7dac3 55%,#ddcdae 100%)`. Borda `#cbb88f`.

## Como regerar este molde

1. Rota de render (so para captura, fora do menu): `/marca-molde`
   (arquivo `artifacts/padcom/src/pages/marca-molde.tsx`).
2. Capturar a pagina em 1280 de largura e converter para PNG.
3. As pecas flat (01, 02) sao compostas direto dos PNG transparentes via ImageMagick.
