---
name: PADAXOR wordmark — regras de uso (Dr. Claude 26/07/2026)
description: Como renderizar o wordmark PADAXOR corretamente em qualquer tela do sistema
---

# Regra: PADAXOR wordmark é ativo gráfico fechado

**Nunca** recriar com CSS, fonte, SVG text, canvas, gradient, filtros, AI ou tracing automático.

## Arquivos oficiais (em `public/brand/`)

| Arquivo | Uso |
|---|---|
| `padaxor-wordmark-nobg.png` | Original transparente (canvas 1916x821 com MUITA margem transparente) |
| `padaxor-wordmark-trim.png` | Derivado sem margens (1740x225) — USE ESTE em header/rodape com altura fixa |
| `padcon-platform.png` | Logo completa PADCON Platform (fundo removido, trim) — credito do desenvolvedor |
| `padcon-platform-word.png` | So o bloco de texto PADCON Platform + Advanced Systems Architecture — rodape |
| (futuro) `padaxor-logo-black.png` | Tela de abertura com fundo preto |

## Regras de renderização (obrigatórias)

```css
width: 100%;
height: auto;
object-fit: contain;
max-width: [conforme contexto — ex: 210px no header mobile];
/* NUNCA: filter, mix-blend-mode, brightness, contrast, saturate, drop-shadow */
```

**Why:** A geometria das letras (vazados do P e R, chanfros, profundidade 3D, reflexos ouro) é personalizada. Qualquer filtro ou redimensionamento forçado destrói o efeito visual. Regra confirmada pelo Dr. Claude em 26/07/2026.

## Subtítulo oficial (duas linhas — copiado de entrada.tsx)

```
Linha 1: "Clinical Intelligence System"  — #8aa0c4, tracking 0.40em, uppercase
Linha 2: "Motor Clínico · Protocolos Injetáveis" — #6f86ad, tracking 0.22em, uppercase
```

## Header sticky (consulta-receituario)

- Fundo sempre navy: `linear-gradient(180deg,#0e1a34 0%,#16284a 100%)`
- Símbolo: `PaxterSymbolGlass size={40} tone="dark"`
- Wordmark: PNG transparente, maxWidth 210px, sem filtros
- Subtítulo: duas linhas (acima)
- Toggle: `ThemeToggle` no canto direito


## Licao (26/07/2026)

PNG oficial com canvas maior que o desenho: renderizar por `height` fixa faz a letra sair
minuscula (821px de canvas para 225px de letra). Derivar versao `-trim` (magick -trim +repage)
e permitido (nao e filtro), o original permanece intacto. Rodape da consulta (revisao CEO 26/07/2026): faixa ESTREITA (52px), alinhada a DIREITA, com
"Desenvolvido pela" + PADCON + Platform em UMA linha (recortes padcon-word-line.png e
padcon-platform-line.png, lado a lado, nunca empilhados); subtitulo "Advanced Systems
Architecture" NAO renderizado (decisao UX: assinatura forte e discreta); sem wordmark PADAXOR
no rodape; credito em texto digitado e proibido.
