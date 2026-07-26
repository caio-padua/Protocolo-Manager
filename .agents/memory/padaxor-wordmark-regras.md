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

## Subtítulo oficial (REVISADO pelo CEO em 26/07/2026 — regra definitiva)

PROIBIDO (o CEO ODEIA e mandou nunca mais usar): os subtítulos empilhados antigos
em uppercase alongado — "CLINICAL INTELLIGENCE SYSTEM" tracking 0.40em azulado +
"MOTOR CLÍNICO · PROTOCOLOS INJETÁVEIS" tracking 0.22em. Nunca mais renderizar
essas linhas nesse formato em NENHUMA tela.

CORRETO: UMA única frase sob o wordmark PADAXOR:

```
"Clinical Intelligence System" — Cormorant Garamond serif, 600, 11px,
tracking curto 0.10em (nao alongado), cor ouro (#d9b45f escuro / #8a6d2f claro),
text-shadow sutil, CENTRALIZADA no ponto medio do wordmark (flex-col items-center).
Mesmo espirito visual do "Platform" da arte PADCON.
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
