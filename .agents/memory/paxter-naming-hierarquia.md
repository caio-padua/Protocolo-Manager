---
name: Hierarquia de nomes PADCOM / Padcon Conect / PAXTER / PAWARDS
description: Quem e quem nos nomes da marca; qual nome o cliente VE na tela. Evita reverter a marca validada.
---

# Hierarquia de nomes (verificada nas Diretrizes Centrais do CEO + decisao 23/06/2026)

| Nome | O que e | Aparece para o cliente? |
|---|---|---|
| PADCOM | Empresa-mae (operacao clinica/comercial) | Nao (nome societario) |
| PAWARDS | Sub-empresa de engenharia/arquitetura de sistemas | Nao (bastidor tecnico) |
| Padcon Conect | Nome INTERNO do produto clinico (1 N) | Nao deve aparecer na tela do cliente |
| PAXTER | A MARCA VISIVEL: simbolo premium + wordmark ouro + "Clinical Intelligence System"; tambem o agente "Dr. Replit Paxter" | SIM — e o que o cliente ve |

**Regra:** nas telas do cliente (anamnese, area, app) a marca exibida e **PAXTER**, nunca "Padcon Conect".

**Why:** em 23/06/2026 o CEO validou a identidade PAXTER (simbolo premium + lockup ouro). A tela real
`/anamnese/v2` tinha ficado para tras com um medalhao generico desenhado a mao (quadrado navy + "P"
serifado) + texto "Padcon Conect"; eu cheguei a RECOMENDAR manter "Padcon Conect" — erro grave que
contrariou o validado. O CEO passou dias no simbolo/efeitos; reverter a marca dele e inaceitavel.

**How to apply:** antes de sugerir qualquer mudanca de marca, conferir esta tabela e os arquivos
`.agents/memory/paxter-simbolo-fundo.md` e `paxter-wordmark-logo-oficial.md`. Em telas de app/anamnese,
usar `PaxterLogo` (variant `appHeader` no fundo claro com `tone="light"`, `compact` em cabecalhos) — que
embute o `PaxterSymbolPremium`. Nunca desenhar a marca por vetor/fonte (serrilhado = versao errada).
Pendencia em aberto: o `replit.md` ainda chama o produto de "Padcon Conect"; so o CEO decide se esse
nome sai de vez das telas (default) ou vira assinatura discreta.
