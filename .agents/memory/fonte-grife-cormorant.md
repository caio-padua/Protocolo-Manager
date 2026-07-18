---
name: Fonte de grife validada — Cormorant Garamond
description: Fonte serifada aprovada pelo CEO para títulos e nomes no sistema Padcon Conect. Fonte correta é Cormorant Garamond, não Marcellus nem Playfair Display.
---

# Fonte de Grife Validada — Cormorant Garamond

## A regra
A fonte serifada oficial do sistema é **"Cormorant Garamond", Georgia, serif**.

Registrada em `specs/acabamento-grife-global.md` (spec de Acabamento de Grife Global):
- `--app-font-display` e `--app-font-serif` = `"Cormorant Garamond", Georgia, serif`
- Títulos de página e nomes de clientes → Cormorant Garamond
- Botões e rótulos uppercase → Archivo / Inter (NUNCA serifada)
- Dados (números, telefones, e-mails) → Inter

**Why:** CEO validou esta fonte durante sessão de design (contexto: cadastro de clientes ou anamnese). Marcellus e Playfair Display nunca foram aprovadas pelo CEO — eram escolhas provisórias do agente.

**How to apply:**
- Usar `style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}` em títulos de seção e nomes
- Ou via `font-serif` / `--app-font-display` quando o CSS base for atualizado
- NUNCA usar Marcellus, Playfair Display, ou Cinzel como fonte de título de tela de trabalho
- Lora → reservada exclusivamente para a pergunta da anamnese do cliente (`.leva-q`)
