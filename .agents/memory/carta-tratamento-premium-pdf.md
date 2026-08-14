---
name: Carta de Tratamento Premium PDF
description: Segundo gerador de PDF de protocolo reaproveitando assinatura PAdES e fontes custom — padrão a seguir em futuros documentos assinados.
---

## Reaproveitar assinatura PAdES entre geradores de PDF

`embedPadesSignature` e `getCertInfo` viviam como funções privadas (não exportadas) dentro de `pdf-signer.ts`, usadas só pelo gerador antigo (`generateProtocolDocumentPdf`).

**Por quê isso importa:** ao criar um segundo gerador de PDF que também precisa de assinatura digital ICP-Brasil (certificado do médico), a tentação é duplicar a lógica de assinatura (placeholder + P12Signer + signpdf). Isso duplicaria uma peça crítica de segurança/compliance em dois lugares que podem divergir com o tempo.

**Como aplicar:** exportar `embedPadesSignature` e `getCertInfo` de `pdf-signer.ts` e importar no novo gerador, chamando com o mesmo contrato: `embedPadesSignature(pdfDoc, { name, reason, location?, contactInfo? })` retorna `Uint8Array` (PDF assinado); `getCertInfo()` retorna os dados do certificado para compor o retorno `{ pdfBytes, certInfo }`. Qualquer terceiro gerador de PDF assinado deve seguir o mesmo caminho — nunca reimplementar o placeholder/P12Signer/signpdf do zero.

## Fonte custom (EB Garamond + Manrope) via fontkit

> Atualizado em 13/08/2026: o Cormorant Garamond foi APAGADO do projeto por ordem
> escrita do CEO (arquivos `.woff`, identificadores `cg*` e o pacote
> `@fontsource/cormorant-garamond`). A serifa única é EB Garamond. Os arquivos
> `.ttf` de EB Garamond entram com `subset: false`; os `.woff`, com `subset: true`.

Para usar fontes que não são as 14 padrão do PDF (Helvetica etc.), é preciso:
1. Instalar `@pdf-lib/fontkit` e registrar com `pdfDoc.registerFontkit(fontkit)`.
2. Usar o subset `latin` (`.woff`) dos pacotes `@fontsource/*` — cobre U+0000–00FF, suficiente para português (acentos, cedilha).
3. Copiar os `.woff` para `assets/fonts/` — o `build.mjs` do api-server já copia `assets/` inteiro pro `dist/` (não precisa mexer no build).
4. Sanitizar texto antes de desenhar — mas com cuidado: ver
   `pdf-sanitizer-latin1.md`, porque a versão ingênua desse filtro imprimiu
   interrogação no documento de um paciente.

## Arcos/círculos no pdf-lib sem drawSvgPath

`drawSvgPath` do pdf-lib exige montar coordenadas SVG manualmente e é fácil errar. Para anéis/arcos (ex.: anel radial de sessões na capa), desenhar com vários `drawLine` curtos ao longo da curva — suave o bastante na resolução de impressão (300dpi+), e muito mais simples de depurar que path SVG.

## `topToY(mm)` — conversão canônica de coordenadas

pdf-lib usa Y crescendo pra cima a partir do rodapé; specs de design descrevem posições em mm a partir do topo da página. Um helper único `topToY(mm)` no gerador evita erros de sinal espalhados pelo código — qualquer novo gerador de PDF com layout "a partir do topo" deveria ter o equivalente.
