---
name: LoginScreen — classes de tema
description: Classes CSS e props específicas da tela de login da área do paciente (/area)
---

# LoginScreen — classes de tema

## Regra

A tela de login NÃO usa `bg-primary` (navy) em NENHUM bloco interno.
Três classes exclusivas em `index.css` controlam a aparência:

| Classe | Elemento | Efeito |
|---|---|---|
| `.login-card-topbar` | Faixa superior "IDENTIFICAÇÃO" | Gradiente creme/dourado (tema claro); navy suave (escuro) |
| `.login-card-body` | Área dos campos | Creme quente (`#fdfaf5→#f6eddb`) no claro; navy profundo no escuro |
| `.btn-3d-gold` | Botão ENTRAR/SALVAR | Gradiente âmbar/mel saliente; texto escuro no claro, marfim no escuro |

## PaxterSymbolGlass no login

Usar `size={52} tone={isDark ? "dark" : "light"} sharp={true}`.

- `sharp=true` → outerR=4, innerR=2 → cantos quase retos, elimina curvatura de vidro
- `size=52` → símbolo cristalino e bem visível no header

## Wordmark PARXIS

`<img src="/brand/parxis-wordmark-clean.png" alt="PARXIS" className="h-9 w-auto object-contain" />`

PNG dourado oficial em `public/brand/parxis-wordmark-clean.png` do artefato padcom.

**Why:** CEO pediu em 19/07/2026: painel sem azul-marinho, bevel saliente, símbolo cristalino sem curvatura nas bordas, wordmark PARXIS em ouro maior, corpo com cor do tema claro, botão ENTRAR dourado.
