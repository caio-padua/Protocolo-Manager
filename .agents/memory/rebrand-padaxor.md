---
name: Rebrand PADAXOR
description: Decisão de marca do CEO em 25/07/2026 — a marca visível ao cliente mudou de PAXTER para PADAXOR.
---

# Rebrand PADAXOR (25/07/2026)

## A regra

A marca visível ao cliente é **PADAXOR** a partir de 25/07/2026.
- PAXTER → substituído por PADAXOR
- PARXIS → produto/site separado, não é a mesma coisa
- Wordmark: Cinzel + gradiente ouro 3D (mesma técnica do lockup anterior)
- Tagline em inglês: "Clinical Intelligence System · Injectable Protocols Engine"

**Why:** O CEO declarou explicitamente: "AGORA NAO É MAIS PAXTER, NEM PARXIS, AGORA É PADAXOR".

## Estado da aplicação

- **Aplicado em 25/07/2026**: tela pública `/consulta-receituario` — wordmark, rodapé, toggle de tema.
- **Aplicado em 13/08/2026**: pdf-signer.ts — todos os 7 locais com "PAXTER" trocados por "PADAXOR" (footer, header de marca, capa tamanho 36, setAuthor, setCreator, rodapé da capa). Header de marca agora usa DARK_BLUE (navy) em vez de PETROL.
- **Pendente**: rebrand global (sidebar, e-mails, WhatsApp, banner, etc.) aguarda ordem explícita do CEO.

## How to apply

- Componente `PadaxorWordmark` em `/consulta-receituario/index.tsx` pode ser extraído para `_shared/`.
- Antes de criar nova tela pública, usar PADAXOR (nunca PAXTER).
- Sistema interno (sidebar, console) aguarda decisão do CEO — não alterar em massa sem ordem dupla.
- Classe `.mt-wordmark` e `PaxterSymbolGlass` continuam idênticos (só o TEXTO do nome muda).
