---
name: Arte de marca — conferir data antes de usar
description: Antes de embutir logo/símbolo em PDF ou e-mail, comparar datas de TODOS os arquivos homônimos; o mais recente costuma estar em attached_assets/, não em src/assets/.
---

# Arte de marca: o arquivo em `src/assets/` costuma ser o mais VELHO

Antes de usar qualquer arte de marca (símbolo, wordmark, lockup), listar **todos** os
arquivos com aquele nome no projeto ordenados por data e escolher o mais recente:

```bash
find . -iname "*padcon*" \( -name "*.png" -o -name "*.svg" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" \
  -printf "%TY-%Tm-%Td %TH:%TM  %8s  %p\n" | sort -r
```

**Why:** artes derivadas (recortes, versões processadas) ficam em `src/assets/` e
`public/brand/` e envelhecem em silêncio. O CEO sobe a arte oficial nova em
`attached_assets/` com nome versionado (`LOGO_PADCON_25_(oficial)`, `LOGO_PADCON_17...`).
O número no nome é a versão — 25 é mais novo que 17. Um recorte antigo pode ter forma
completamente diferente da oficial vigente (quadrados arredondados x hexágono), não
apenas resolução menor.

**How to apply:** ao pedir "use a logo X", nunca pegar o primeiro arquivo que casar
com o nome. Listar por data, abrir a arte oficial mais recente, e conferir visualmente
que a forma bate. Arte oficial vinda de `attached_assets/` normalmente **não tem alfa**
(fundo branco sólido) — extrair com `-fuzz 12% -transparent white -trim +repage` e
validar sobre magenta antes de embutir.

## Nunca chutar coordenadas de `-crop`: medir o perfil de conteúdo

Estimar o recorte "no olho" a partir da imagem exibida decepa parte da arte em silêncio
(`-trim` depois apara o vazio e o resultado *parece* íntegro). Medir as faixas com
conteúdo opaco antes de recortar:

```bash
magick arte.png -fuzz 12% -transparent white -alpha extract -threshold 20% \
  -scale 1x70! -depth 8 txt: | awk -F'[,:() ]+' 'NR>1{print $2, $4}'
```

Linhas com valor 0 são os vãos entre elementos; é ali que o `-crop` pode cortar.

**Why:** um hexágono foi entregue decepado ao CEO porque o crop parou 95 px antes do
fim da figura, e o `-trim` posterior deixou a arte com aparência plausível.

## Frase-assinatura ilegível: tirar da imagem e desenhar como texto

Tagline embutida em raster (ex.: "Advanced Systems Architecture" dentro do PNG do
wordmark) vira borrão quando o lockup é reduzido para assinatura de rodapé. Recortar a
arte só até a última linha legível e desenhar a tagline com `drawText` em cor de alto
contraste (branco sobre navy), dimensionada para ler.

